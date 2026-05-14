import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { WalletProvider } from "@/lib/WalletContext";

import "./globals.css";

const geistSans = Geist({
    variable: "--font-geist-sans",
    subsets: ["latin"],
});

const geistMono = Geist_Mono({
    variable: "--font-geist-mono",
    subsets: ["latin"],
});

export const metadata: Metadata = {
    title: "DAO Votación Gasless",
    description: "DAO con votos sin gas vía meta-transacciones EIP-2771 (CodeCrypto capstone).",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="es" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
            <body className="min-h-full flex flex-col">
                <WalletProvider>{children}</WalletProvider>
            </body>
        </html>
    );
}
