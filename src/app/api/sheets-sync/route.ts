import { NextResponse } from "next/server";
import { google } from "googleapis";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

    const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/^"|"$|'/g, "").replace(/\\n/g, "\n");
    const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
    if (!email || !privateKey || !spreadsheetId) {
      return NextResponse.json({ error: "Configure GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY e GOOGLE_SHEETS_SPREADSHEET_ID no .env.local e na Vercel." }, { status: 400 });
    }

    const auth = new google.auth.JWT({ email, key: privateKey, scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
    const sheets = google.sheets({ version: "v4", auth });
    const [
      { data: expenses, error: eError },
      { data: payments, error: pError },
      { data: receipts, error: rError }
    ] = await Promise.all([
      supabase.from("expenses").select("*").order("date"),
      supabase.from("payments").select("*").is("payment_batch_id", null).order("payment_date"),
      supabase.from("payment_batches").select("*").order("payment_date")
    ]);
    if (eError || pError || rError) throw new Error(eError?.message || pError?.message || rError?.message || "Erro ao ler dados.");

    const paymentRows = [
      ...(payments ?? []).map(payment => ({
        id: payment.id,
        expense_id: payment.expense_id,
        payment_date: payment.payment_date,
        amount: Number(payment.amount),
        notes: payment.notes ?? "",
        user_id: payment.user_id
      })),
      ...(receipts ?? []).map(receipt => ({
        id: receipt.id,
        expense_id: "",
        payment_date: receipt.payment_date,
        amount: Number(receipt.total_amount),
        notes: receipt.notes ?? "",
        user_id: receipt.user_id
      }))
    ].sort((first, second) => first.payment_date.localeCompare(second.payment_date));

    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: {
        valueInputOption: "USER_ENTERED",
        data: [
          { range: "Despesas!A1:H", values: [["ID","Data","Descrição","Detalhes","Valor Total","Valor Pago","Saldo Pendente","Quitado"], ...(expenses ?? []).map(e=>[e.id,e.date,e.description,e.details ?? "",Number(e.total_amount),Number(e.paid_amount),Math.max(0,Number(e.total_amount)-Number(e.paid_amount)),e.is_paid?"Sim":"Não"])] },
          { range: "Pagamentos!A1:F", values: [["ID","Despesa ID","Data do pagamento","Valor","Observações","Usuário"], ...paymentRows.map(payment=>[payment.id,payment.expense_id,payment.payment_date,payment.amount,payment.notes,payment.user_id])] }
        ]
      }
    });
    return NextResponse.json({ ok: true, expenses: expenses?.length ?? 0, payments: paymentRows.length });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro desconhecido ao sincronizar." }, { status: 500 });
  }
}
