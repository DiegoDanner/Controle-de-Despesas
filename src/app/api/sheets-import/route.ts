import { NextResponse } from "next/server";
import { google } from "googleapis";
import { createClient } from "@/lib/supabase/server";

type ExpenseImportRow = {
  user_id: string;
  date: string;
  description: string;
  details: string | null;
  total_amount: number;
  paid_amount: number;
  is_paid: boolean;
};

function normalizeHeader(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("pt-BR");
}

function formatDate(year: number, month: number, day: number, rowNumber: number) {
  const result = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const parsed = new Date(`${result}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== result) {
    throw new Error(`Linha ${rowNumber}: data inválida.`);
  }
  return result;
}

function parseDate(value: unknown, rowNumber: number) {
  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(Date.UTC(1899, 11, 30) + Math.trunc(value) * 86400000);
    if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10);
  }

  if (typeof value === "string") {
    const text = value.trim();
    const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);
    if (iso) return formatDate(Number(iso[1]), Number(iso[2]), Number(iso[3]), rowNumber);
    const br = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/.exec(text);
    if (br) return formatDate(Number(br[3]), Number(br[2]), Number(br[1]), rowNumber);
  }

  throw new Error(`Linha ${rowNumber}: informe uma data válida em Data.`);
}

function parseAmount(value: unknown, rowNumber: number, label: string, optional = false) {
  if (value === null || value === undefined || value === "") {
    if (optional) return 0;
    throw new Error(`Linha ${rowNumber}: informe um valor em ${label}.`);
  }
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") throw new Error(`Linha ${rowNumber}: valor inválido em ${label}.`);

  const text = value.trim().replace(/[^\d,.-]/g, "");
  const comma = text.lastIndexOf(",");
  const dot = text.lastIndexOf(".");
  const normalized = comma > dot
    ? text.replace(/\./g, "").replace(",", ".")
    : text.replace(/,/g, "");
  const amount = Number(normalized);
  if (!Number.isFinite(amount)) throw new Error(`Linha ${rowNumber}: valor inválido em ${label}.`);
  return amount;
}

export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

    const { count, error: countError } = await supabase
      .from("expenses")
      .select("id", { count: "exact", head: true });
    if (countError) throw new Error(countError.message);
    if ((count ?? 0) > 0) {
      return NextResponse.json({ error: "A importação só pode ser feita quando não há despesas cadastradas, para evitar duplicações." }, { status: 409 });
    }

    const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/^"|"$|'/g, "").replace(/\\n/g, "\n");
    const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
    if (!email || !privateKey || !spreadsheetId) {
      return NextResponse.json({ error: "Configure as credenciais do Google Sheets no ambiente." }, { status: 400 });
    }

    const auth = new google.auth.JWT({
      email,
      key: privateKey,
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"]
    });
    const { data } = await google.sheets({ version: "v4", auth }).spreadsheets.values.get({
      spreadsheetId,
      range: "Despesas!A1:Z",
      valueRenderOption: "UNFORMATTED_VALUE"
    });

    const rows = data.values ?? [];
    if (rows.length < 2) {
      return NextResponse.json({ error: "A aba Despesas não contém linhas para importar." }, { status: 400 });
    }

    const headers = rows[0].map(normalizeHeader);
    const column = (...names: string[]) => headers.findIndex(header => names.includes(header));
    const dateIndex = column("data", "date");
    const descriptionIndex = column("descricao", "description");
    const detailsIndex = column("detalhes", "parcelamento / detalhes", "parcelamento", "details");
    const totalIndex = column("valor total", "total_amount", "total amount");
    const paidIndex = column("valor pago", "paid_amount", "paid amount");

    if (dateIndex < 0 || descriptionIndex < 0 || totalIndex < 0) {
      return NextResponse.json({ error: "A aba Despesas precisa ter os cabeçalhos Data, Descrição e Valor Total." }, { status: 422 });
    }

    let expenses: ExpenseImportRow[];
    try {
      expenses = rows.slice(1).flatMap((row, index) => {
        if (row.every((value: unknown) => value === null || value === undefined || String(value).trim() === "")) return [];
        if (normalizeHeader(row[0]) === "total") return [];
        const rowNumber = index + 2;
        const description = String(row[descriptionIndex] ?? "").trim();
        if (!description) throw new Error(`Linha ${rowNumber}: descrição obrigatória.`);

        const totalAmount = Math.round(parseAmount(row[totalIndex], rowNumber, "Valor Total") * 100) / 100;
        const paidAmount = Math.round(parseAmount(paidIndex < 0 ? undefined : row[paidIndex], rowNumber, "Valor Pago", true) * 100) / 100;
        if (totalAmount < 0 || paidAmount < 0 || paidAmount > totalAmount) {
          throw new Error(`Linha ${rowNumber}: confira os valores total e pago.`);
        }

        const detail = detailsIndex < 0 ? "" : String(row[detailsIndex] ?? "").trim();
        return [{
          user_id: user.id,
          date: parseDate(row[dateIndex], rowNumber),
          description,
          details: detail || null,
          total_amount: totalAmount,
          paid_amount: paidAmount,
          is_paid: paidAmount >= totalAmount
        }];
      });
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Dados inválidos na planilha." }, { status: 422 });
    }

    if (expenses.length === 0) {
      return NextResponse.json({ error: "Nenhuma despesa preenchida foi encontrada para importar." }, { status: 400 });
    }

    const { error: insertError } = await supabase.from("expenses").insert(expenses);
    if (insertError) throw new Error(insertError.message);

    return NextResponse.json({ ok: true, imported: expenses.length });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro desconhecido ao importar." }, { status: 500 });
  }
}