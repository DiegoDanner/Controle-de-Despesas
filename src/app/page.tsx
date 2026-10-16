 "use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { FileSpreadsheet, Download, Plus, DollarSign, CircleCheck, Clock3, ReceiptText, Search, Pencil, Trash2, X, Save, RefreshCw, LogOut, CircleAlert, Upload, Moon, Sun, AlertTriangle } from "lucide-react";
import { useTheme } from "@/lib/theme";

type Expense = {
  id: string; user_id: string; date: string; description: string; details: string | null;
  total_amount: number; paid_amount: number; is_paid: boolean; created_at?: string;
};
type Payment = { id: string; expense_id: string; user_id: string; payment_date: string; amount: number; notes: string | null; };
type PaymentBatch = { id: string; user_id: string; payment_date: string; total_amount: number; notes: string | null; };
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dateBR = (d: string) => d ? new Date(`${d}T12:00:00`).toLocaleDateString("pt-BR") : "—";
const DEFAULT_DASHBOARD_TITLE = "Controle de Empréstimos e Despesas - Sobrinha";
const emptyForm = { date: new Date().toISOString().slice(0,10), description: "", details: "", total_amount: "", paid_amount: "0" };

function parseCurrencyInput(value: string) {
  const text = value.trim().replace(/[^\d,.-]/g, "");
  const comma = text.lastIndexOf(",");
  const dot = text.lastIndexOf(".");
  return Number(comma > dot ? text.replace(/\./g, "").replace(",", ".") : text.replace(/,/g, ""));
}

export default function Dashboard() {
  const { theme, toggleTheme } = useTheme();
  const [userId, setUserId] = useState("");
  const [dashboardTitle, setDashboardTitle] = useState(DEFAULT_DASHBOARD_TITLE);
  const [titleDraft, setTitleDraft] = useState(DEFAULT_DASHBOARD_TITLE);
  const [editingTitle, setEditingTitle] = useState(false);
  const [savingTitle, setSavingTitle] = useState(false);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [paymentBatches, setPaymentBatches] = useState<PaymentBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [filter, setFilter] = useState<"all"|"pending"|"paid">("all");
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<Expense|null>(null);
  const [form, setForm] = useState(emptyForm);
  const [batchPaymentModal, setBatchPaymentModal] = useState(false);
  const [batchPaymentForm, setBatchPaymentForm] = useState({ payment_date: new Date().toISOString().slice(0,10), amount: "" });
  const [deleteAllModal, setDeleteAllModal] = useState(false);
  const [deleteAllConfirmation, setDeleteAllConfirmation] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const supabase = useMemo(() => {
    try { return createClient(); } catch (e) { return null as any; }
  }, []);

  async function load() {
    setLoading(true);
    if (!supabase) { window.location.href = "/login"; return; }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { window.location.href = "/login"; return; }
    setUserId(user.id);
    const savedTitle = typeof user.user_metadata?.dashboard_title === "string"
      ? user.user_metadata.dashboard_title.trim().slice(0, 80)
      : "";
    const nextTitle = savedTitle || DEFAULT_DASHBOARD_TITLE;
    setDashboardTitle(nextTitle);
    setTitleDraft(nextTitle);
    const [e, p, b] = await Promise.all([
      supabase.from("expenses").select("*").order("date", { ascending: false }),
      supabase.from("payments").select("*").is("payment_batch_id", null).order("payment_date", { ascending: false }),
      supabase.from("payment_batches").select("*").order("payment_date", { ascending: false })
    ]);
    if (e.error) setNotice(`Erro ao carregar despesas: ${e.error.message}`);
    else if (p.error) setNotice(`Erro ao carregar pagamentos: ${p.error.message}`);
    else if (b.error) setNotice(`Erro ao carregar recebimentos: ${b.error.message}. Execute o schema atualizado no Supabase.`);
    setExpenses((e.data ?? []) as Expense[]);
    setPayments((p.data ?? []) as Payment[]);
    setPaymentBatches((b.data ?? []) as PaymentBatch[]);
    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const total = expenses.reduce((s,e)=>s+Number(e.total_amount),0);
  const paid = expenses.reduce((s,e)=>s+Number(e.paid_amount),0);
  const pending = Math.max(0,total-paid);
  const paidCount = expenses.filter(e=>e.is_paid || Number(e.total_amount)-Number(e.paid_amount)<=0.005).length;
  const visible = useMemo(() => expenses.filter(e => {
    const matches = `${e.description} ${e.details ?? ""}`.toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR"));
    const state = filter==="all" || (filter==="pending" && !e.is_paid) || (filter==="paid" && e.is_paid);
    return matches && state;
  }), [expenses, search, filter]);
  const parsedBatchAmount = parseCurrencyInput(batchPaymentForm.amount);
  const batchAmount = Number.isFinite(parsedBatchAmount) ? Math.round(parsedBatchAmount * 100) / 100 : Number.NaN;
  const paymentHistory = [
    ...paymentBatches.map(batch => ({
      id: batch.id,
      payment_date: batch.payment_date,
      amount: Number(batch.total_amount),
      notes: batch.notes,
      source: "batch" as const
    })),
    ...payments.map(payment => ({
      id: payment.id,
      payment_date: payment.payment_date,
      amount: Number(payment.amount),
      notes: payment.notes,
      source: "payment" as const
    }))
  ].sort((first, second) => second.payment_date.localeCompare(first.payment_date));

  function openNew() { setEditing(null); setForm(emptyForm); setModal(true); }
  function openEdit(e: Expense) { setEditing(e); setForm({date:e.date, description:e.description, details:e.details??"", total_amount:String(e.total_amount), paid_amount:String(e.paid_amount)}); setModal(true); }
  function cancelTitleEdit() {
    setTitleDraft(dashboardTitle);
    setEditingTitle(false);
  }
  async function saveDashboardTitle(event: React.FormEvent) {
    event.preventDefault();
    const nextTitle = titleDraft.trim();
    if (!nextTitle) { setNotice("O título não pode ficar vazio."); return; }

    setSavingTitle(true);
    setNotice("");
    try {
      const { error } = await supabase.auth.updateUser({ data: { dashboard_title: nextTitle } });
      if (error) { setNotice("Não foi possível salvar o título: " + error.message); return; }
      setDashboardTitle(nextTitle);
      setEditingTitle(false);
      setNotice("Título atualizado.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Não foi possível salvar o título.");
    } finally {
      setSavingTitle(false);
    }
  }
  async function saveExpense(ev: React.FormEvent) {
    ev.preventDefault(); setBusy(true); setNotice("");
    const totalAmount = Number(form.total_amount.replace(",", "."));
    const paidAmount = Number(form.paid_amount.replace(",", "."));
    if (!form.description.trim() || !Number.isFinite(totalAmount) || totalAmount < 0 || !Number.isFinite(paidAmount) || paidAmount < 0 || paidAmount > totalAmount) {
      setNotice("Confira a descrição e os valores. O valor pago não pode superar o total."); setBusy(false); return;
    }
    const row = { user_id:userId, date:form.date, description:form.description.trim(), details:form.details.trim() || null, total_amount:totalAmount, paid_amount:paidAmount, is_paid:paidAmount >= totalAmount };
    const result = editing ? await supabase.from("expenses").update(row).eq("id",editing.id) : await supabase.from("expenses").insert(row);
    if (result.error) setNotice("Não foi possível salvar: " + result.error.message);
    else { setModal(false); await load(); setNotice("Despesa salva."); }
    setBusy(false);
  }
  async function deleteExpense(e: Expense) {
    if (!window.confirm(`Excluir "${e.description}" e seu histórico de pagamentos?`)) return;
    const { error } = await supabase.from("expenses").delete().eq("id",e.id);
    if (error) setNotice("Não foi possível excluir: " + error.message); else { await load(); setNotice("Despesa excluída."); }
  }
  async function deleteAllData(event: React.FormEvent) {
    event.preventDefault();
    if (deleteAllConfirmation !== "APAGAR") return;

    setBusy(true);
    setNotice("");
    try {
      const { error } = await supabase.rpc("delete_all_financial_data");
      if (error) { setNotice("Não foi possível apagar os dados: " + error.message); return; }
      setDeleteAllModal(false);
      setDeleteAllConfirmation("");
      setSearch("");
      setFilter("all");
      await load();
      setNotice("Todas as despesas e todos os pagamentos foram apagados.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Não foi possível apagar os dados.");
    } finally {
      setBusy(false);
    }
  }
  function openBatchPayment() {
    setBatchPaymentForm({ payment_date: new Date().toISOString().slice(0,10), amount: "" });
    setBatchPaymentModal(true);
  }
  async function saveBatchPayment(ev: React.FormEvent) {
    ev.preventDefault();
    if (!Number.isFinite(batchAmount) || batchAmount <= 0) { setNotice("Informe um valor recebido maior que zero."); return; }

    setBusy(true);
    setNotice("");
    try {
      const { error } = await supabase.rpc("create_payment_receipt", {
        p_amount: batchAmount,
        p_payment_date: batchPaymentForm.payment_date,
        p_notes: null
      });
      if (error) { setNotice("Erro ao registrar recebimento: " + error.message); return; }
      setBatchPaymentModal(false);
      await load();
      setNotice("Recebimento registrado. Atualize os itens pagos individualmente.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Não foi possível registrar o recebimento.");
    } finally {
      setBusy(false);
    }
  }
  async function deletePaymentReceipt(item: { id: string; source: "batch" | "payment"; amount: number }) {
    if (!window.confirm(`Excluir o recebimento de ${brl(item.amount)}? Os valores pagos das despesas não serão alterados.`)) return;
    setBusy(true);
    try {
      const result = item.source === "batch"
        ? await supabase.rpc("delete_payment_batch", { p_batch_id: item.id })
        : await supabase.from("payments").delete().eq("id", item.id);
      const { error } = result;
      if (error) { setNotice("Não foi possível excluir o recebimento: " + error.message); return; }
      await load();
      setNotice("Recebimento excluído. Os valores pagos das despesas não foram alterados.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Não foi possível excluir o recebimento.");
    } finally {
      setBusy(false);
    }
  }
  function exportCSV() {
    const rows = [["Item","Data","Descrição","Parcelamento / Detalhes","Valor Total","Valor Pago","Saldo Pendente","Pago?"], ...expenses.map((e,i)=>[String(i+1),dateBR(e.date),e.description,e.details??"",String(e.total_amount),String(e.paid_amount),String(Math.max(0,e.total_amount-e.paid_amount)),e.is_paid?"Sim":"Não"])];
    const csv = "\uFEFF" + rows.map(r=>r.map(v=>`"${String(v).replaceAll('"','""')}"`).join(";")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8;"}));
    const a = document.createElement("a"); a.href=url; a.download="controle-emprestimos-despesas.csv"; a.click(); URL.revokeObjectURL(url);
  }
  async function syncSheets() {
    setBusy(true); setNotice("");
    const res = await fetch("/api/sheets-sync",{method:"POST"});
    const data = await res.json().catch(()=>({}));
    setNotice(res.ok ? "Planilha Google Sheets sincronizada." : (data.error || "Configure as credenciais do Google Sheets no ambiente."));
    setBusy(false);
  }
  async function importSheets() {
    if (!window.confirm("Importar despesas da aba Despesas? A importação só funciona quando não há despesas cadastradas e não cria o histórico individual de pagamentos.")) return;
    setBusy(true); setNotice("");
    try {
      const res = await fetch("/api/sheets-import", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setNotice(data.error || "Não foi possível importar as despesas."); return; }
      await load();
      setNotice(`${data.imported} despesas importadas do Google Sheets.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Falha ao conectar com o Google Sheets.");
    } finally {
      setBusy(false);
    }
  }
  async function signOut() { await supabase.auth.signOut(); window.location.href="/login"; }

  return <main className="app-shell">
    <header className="topbar">
      <div className="brand"><div className="brand-mark"><FileSpreadsheet size={26}/></div><div className="brand-copy">{editingTitle
        ? <form className="title-edit-form" onSubmit={saveDashboardTitle}><input aria-label="Título do webapp" autoFocus maxLength={80} value={titleDraft} onKeyDown={event=>{if(event.key==="Escape")cancelTitleEdit();}} onChange={event=>setTitleDraft(event.target.value)}/><button type="submit" className="icon-button" title="Salvar título" aria-label="Salvar título" disabled={savingTitle}><Save size={15}/></button><button type="button" className="icon-button" title="Cancelar edição" aria-label="Cancelar edição" onClick={cancelTitleEdit} disabled={savingTitle}><X size={15}/></button></form>
        : <div className="brand-title-line"><h1>{dashboardTitle}</h1><button type="button" className="icon-button title-edit-button" title="Editar título" aria-label="Editar título" onClick={()=>{setTitleDraft(dashboardTitle);setEditingTitle(true);}}><Pencil size={14}/></button></div>}
        <p>Gerenciamento de despesas, parcelamentos e controle de quitação</p></div></div>
      <div className="top-actions"><button className="secondary" onClick={exportCSV}><Download size={16}/> Baixar Planilha</button><button className="primary" onClick={openNew}><Plus size={18}/> Adicionar Item</button><button type="button" className="icon-button theme-toggle" title={theme === "dark" ? "Ativar tema claro" : "Ativar tema escuro"} aria-label={theme === "dark" ? "Ativar tema claro" : "Ativar tema escuro"} onClick={toggleTheme}>{theme === "dark" ? <Sun size={18}/> : <Moon size={18}/>}</button><button className="icon-button logout" title="Sair" onClick={signOut}><LogOut size={17}/></button></div>
    </header>
    {notice && <div className="notice"><CircleAlert size={17}/><span>{notice}</span><button onClick={()=>setNotice("")} aria-label="Fechar aviso"><X size={15}/></button></div>}
    <section className="stats">
      <Stat icon={<DollarSign size={23}/>} tone="purple" label="VALOR TOTAL" value={brl(total)}/>
      <Stat icon={<CircleCheck size={22}/>} tone="green" label="TOTAL PAGO" value={brl(paid)}/>
      <Stat icon={<Clock3 size={22}/>} tone="red" label="SALDO PENDENTE" value={brl(pending)}/>
      <Stat icon={<ReceiptText size={22}/>} tone="orange" label="ITENS QUITADOS" value={<>{paidCount} / {expenses.length} <small>({expenses.length-paidCount} pendentes)</small></>}/>
    </section>
    <section className="searchbar"><div className="search-input"><Search size={17}/><input ref={searchInputRef} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar por descrição ou detalhes..."/>{search && <button type="button" className="icon-button" title="Limpar busca" aria-label="Limpar busca" onClick={()=>{setSearch("");searchInputRef.current?.focus();}}><X size={15}/></button>}</div><div className="filters"><button className={filter==="all"?"active":""} onClick={()=>setFilter("all")}>Todos ({expenses.length})</button><button className={filter==="pending"?"active":""} onClick={()=>setFilter("pending")}>Pendentes ({expenses.filter(e=>!e.is_paid).length})</button><button className={filter==="paid"?"active":""} onClick={()=>setFilter("paid")}>Quitados ({paidCount})</button></div></section>
    <div className="content-grid">
      <section className="panel expense-panel">
        <div className="panel-head"><div><h2>Despesas e Parcelamentos</h2><p>{visible.length} de {expenses.length} itens listados</p></div><div className="panel-head-actions"><button type="button" className="text-button danger-text-button" onClick={()=>{setDeleteAllConfirmation("");setDeleteAllModal(true);}} disabled={busy || (expenses.length === 0 && paymentHistory.length === 0)}><Trash2 size={15}/> Apagar tudo</button><button className="text-button" onClick={openNew}><Plus size={15}/> Adicionar Linha</button></div></div>
        <div className="table-wrap"><table className="expenses-table"><thead><tr><th>Item</th><th>Data</th><th>Descrição</th><th>Parcelamento / Detalhes</th><th>Valor Total</th><th>Valor Pago</th><th>Saldo Pendente</th><th>Pago?</th><th>Ações</th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={9} className="empty">Carregando dados...</td></tr>
              : visible.length === 0 ? <tr><td colSpan={9} className="empty">Nenhuma despesa encontrada.</td></tr>
              : visible.map((expense, index) => <tr key={expense.id}>
                  <td>{index + 1}</td>
                  <td>{dateBR(expense.date)}</td>
                  <td className="description">{expense.description}</td>
                  <td className="details">{expense.details || "—"}</td>
                  <td>{brl(Number(expense.total_amount))}</td>
                  <td className="green-text">{brl(Number(expense.paid_amount))}</td>
                  <td className={expense.total_amount - expense.paid_amount > 0 ? "red-text" : "green-text"}>{brl(Math.max(0, Number(expense.total_amount) - Number(expense.paid_amount)))}</td>
                  <td><button className={`paid-toggle ${expense.is_paid ? "checked" : ""}`} title="Editar valor pago" aria-label={`Editar valor pago de ${expense.description}`} onClick={() => openEdit(expense)}>{expense.is_paid ? <CircleCheck size={17}/> : <span/>}</button></td>
                  <td><div className="row-actions"><button title="Editar" onClick={() => openEdit(expense)}><Pencil size={16}/></button><button title="Excluir" onClick={() => deleteExpense(expense)}><Trash2 size={16}/></button></div></td>
                </tr>)}
          </tbody>
          <tfoot><tr><td colSpan={4}>TOTAL</td><td>{brl(total)}</td><td className="green-text">{brl(paid)}</td><td className="red-text">{brl(pending)}</td><td colSpan={2}>—</td></tr></tfoot>
        </table></div>
      </section>
      <aside className="side-column">
        <section className="panel history-panel">
          <div className="panel-head">
            <div><h2>Histórico de Pagamentos Recebidos</h2><p>{paymentHistory.length} recebimentos registrados</p></div>
            <button className="text-button" onClick={openBatchPayment} disabled={busy}><Plus size={15}/> Adicionar</button>
          </div>
          <div className="table-wrap"><table className="history-table">
            <thead><tr><th>Data Pagamento</th><th>Valor Recebido</th><th aria-label="Ações"/></tr></thead>
            <tbody>
              {paymentHistory.length === 0
                ? <tr><td colSpan={3} className="empty">Nenhum pagamento registrado.</td></tr>
                : paymentHistory.map(item => <tr key={`${item.source}-${item.id}`}>
                    <td>{dateBR(item.payment_date)}{item.notes && <small className="payment-note">{item.notes}</small>}</td>
                    <td>{brl(item.amount)}</td>
                  <td><button className="icon-button" title="Excluir recebimento" aria-label="Excluir recebimento" disabled={busy} onClick={() => deletePaymentReceipt(item)}><Trash2 size={15}/></button></td>
                  </tr>)}
            </tbody>
            <tfoot><tr><td>Total Recebido</td><td>{brl(paymentHistory.reduce((sum, item) => sum + item.amount, 0))}</td><td/></tr></tfoot>
          </table></div>
        </section>
        <section className="sync-card"><div className="sync-title"><RefreshCw size={17}/><strong>Google Sheets</strong></div><p>Envie os dados do app para a planilha ou importe despesas da aba Despesas. A importação é bloqueada se já houver despesas cadastradas.</p><button className="secondary sync-button" disabled={busy} onClick={syncSheets}><RefreshCw size={15}/> Enviar para Sheets</button><button className="secondary sync-button" disabled={busy} onClick={importSheets}><Upload size={15}/> Importar despesas</button></section>
      </aside>
    </div>
    <footer className="footer">Controle de despesas · Dados protegidos por autenticação</footer>

    {modal && <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setModal(false)}}><form className="modal" onSubmit={saveExpense}><div className="modal-head"><div><h2>{editing?"Editar despesa":"Adicionar despesa"}</h2><p>Preencha os dados do item.</p></div><button type="button" className="icon-button" onClick={()=>setModal(false)}><X size={18}/></button></div>
      <label>Data<input type="date" required value={form.date} onChange={e=>setForm({...form,date:e.target.value})}/></label>
      <label>Descrição<input required value={form.description} onChange={e=>setForm({...form,description:e.target.value})} placeholder="Ex.: Empréstimo, medicamento..."/></label>
      <label>Parcelamento / detalhes<input value={form.details} onChange={e=>setForm({...form,details:e.target.value})} placeholder="Ex.: 3 de 3 pagas"/></label>
      <div className="form-row"><label>Valor total (R$)<input required inputMode="decimal" value={form.total_amount} onChange={e=>setForm({...form,total_amount:e.target.value})} placeholder="0,00"/></label><label>Valor pago (R$)<input required inputMode="decimal" value={form.paid_amount} onChange={e=>setForm({...form,paid_amount:e.target.value})} placeholder="0,00"/></label></div>
      <div className="modal-actions"><button type="button" className="secondary" onClick={()=>setModal(false)}>Cancelar</button><button className="primary" disabled={busy}><Save size={16}/>{busy?"Salvando...":"Salvar item"}</button></div>
    </form></div>}
    {batchPaymentModal && <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setBatchPaymentModal(false)}}><form className="modal" onSubmit={saveBatchPayment}>
      <div className="modal-head"><div><h2>Registrar recebimento</h2><p>Registre o total recebido. Atualize os itens pagos separadamente.</p></div><button type="button" className="icon-button" onClick={()=>setBatchPaymentModal(false)} aria-label="Fechar"><X size={18}/></button></div>
      <label>Data do pagamento<input type="date" required value={batchPaymentForm.payment_date} onChange={e=>setBatchPaymentForm({...batchPaymentForm,payment_date:e.target.value})}/></label>
      <label>Valor recebido (R$)<input required inputMode="decimal" value={batchPaymentForm.amount} onChange={e=>setBatchPaymentForm({...batchPaymentForm,amount:e.target.value})} placeholder="0,00"/></label>
      <div className="modal-actions"><button type="button" className="secondary" onClick={()=>setBatchPaymentModal(false)}>Cancelar</button><button className="primary" disabled={busy || !Number.isFinite(batchAmount) || batchAmount <= 0}><Save size={16}/>{busy?"Registrando...":"Salvar recebimento"}</button></div>
    </form></div>}
    {deleteAllModal && <div className="modal-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget && !busy)setDeleteAllModal(false)}}><form className="modal delete-all-modal" role="alertdialog" aria-modal="true" aria-labelledby="delete-all-title" onSubmit={deleteAllData}>
      <div className="modal-head"><div className="delete-all-heading"><AlertTriangle size={22}/><h2 id="delete-all-title">Apagar todos os dados?</h2></div><button type="button" className="icon-button" onClick={()=>setDeleteAllModal(false)} disabled={busy} aria-label="Fechar"><X size={18}/></button></div>
      <p>Esta ação não tem volta. Serão apagadas todas as despesas, os recebimentos e o histórico de pagamentos desta conta.</p>
      <p>Para confirmar, digite <strong>APAGAR</strong>.</p>
      <input autoFocus aria-label="Digite APAGAR para confirmar" autoComplete="off" value={deleteAllConfirmation} onChange={event=>setDeleteAllConfirmation(event.target.value)} placeholder="APAGAR"/>
      <div className="modal-actions"><button type="button" className="secondary" onClick={()=>setDeleteAllModal(false)} disabled={busy}>Cancelar</button><button type="submit" className="danger-button" disabled={busy || deleteAllConfirmation !== "APAGAR"}><Trash2 size={16}/>{busy ? "Apagando..." : "Apagar tudo"}</button></div>
    </form></div>}
  </main>;
}

function Stat({icon,tone,label,value}:{icon:React.ReactNode;tone:string;label:string;value:React.ReactNode}) {
  return <div className="stat-card"><div className={`stat-icon ${tone}`}>{icon}</div><div className="stat-copy"><span>{label}</span><strong className={tone==="green"?"green-text":tone==="red"?"red-text":""}>{value}</strong></div></div>;
}
