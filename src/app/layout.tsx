import type { Metadata } from "next";
import "./globals.css";
import "./dark-mode.css";

export const metadata: Metadata = {
  title: "Controle de Empréstimos e Despesas – Sobrinha",
  description: "Gerenciamento de despesas, parcelamentos e controle de quitação."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
