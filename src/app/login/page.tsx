 "use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Eye, EyeOff, FileSpreadsheet, LockKeyhole, Moon, Sun } from "lucide-react";
import { useTheme } from "@/lib/theme";

export default function LoginPage() {
  const { theme, toggleTheme } = useTheme();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const supabase = createClient();

  async function signIn(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); setMessage("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setMessage(`Falha no login: ${error.message}`);
    else window.location.href = "/";
    setLoading(false);
  }

  return <main className="login-shell">
    <button type="button" className="icon-button theme-toggle login-theme-toggle" title={theme === "dark" ? "Ativar tema claro" : "Ativar tema escuro"} aria-label={theme === "dark" ? "Ativar tema claro" : "Ativar tema escuro"} onClick={toggleTheme}>{theme === "dark" ? <Sun size={18}/> : <Moon size={18}/>}</button>
    <form className="login-card" onSubmit={signIn}>
      <div className="brand-mark"><FileSpreadsheet size={27}/></div>
      <h1>Controle de Empréstimos</h1>
      <p className="muted">Sobrinha · Acesso restrito</p>
      <label>E-mail<input type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="voce@exemplo.com"/></label>
      <label>Senha<div className="password-input-wrap"><input type={showPassword ? "text" : "password"} autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)} placeholder="Sua senha"/><button type="button" className="icon-button password-visibility-toggle" title={showPassword ? "Ocultar senha" : "Mostrar senha"} aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"} aria-pressed={showPassword} onClick={()=>setShowPassword(visible=>!visible)}>{showPassword ? <EyeOff size={17}/> : <Eye size={17}/>}</button></div></label>
      {message && <p className="error-message">{message}</p>}
      <button className="primary full" disabled={loading}>{loading ? "Entrando..." : <><LockKeyhole size={16}/> Entrar</>}</button>
      <p className="muted tiny">Crie o usuário inicial em Supabase → Authentication → Users.</p>
    </form>
  </main>;
}
