import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Food SaaS",
  description: "Sistema SaaS multi-comercio para pedidos gastronómicos",
  manifest: "/manifest.webmanifest",
  verification: {
    google: "SFfeTNDPXXKRF39wnVOaO3WvdQ4CgyPauJ8KtFkBWh8",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
