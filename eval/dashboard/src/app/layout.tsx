import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Eval Studio · Abitura",
  description: "Локальная панель оценки embedding-моделей для RAG Abitura",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru" className="dark">
      <body>{children}</body>
    </html>
  );
}
