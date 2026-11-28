import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@omnikes/contexts/AuthContext";
import { StoreProvider } from "@omnikes/contexts/StoreContext";
import { FirstLaunchGuard } from "@omnikes/components/setup/FirstLaunchGuard";
import { APP_VERSION } from "@omnikes/lib/app-version";

export const dynamic = "force-dynamic";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "OmniKès - Système de Gestion Commerciale",
  description: "Système de Gestion Commerciale",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="fr"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <AuthProvider>
          <FirstLaunchGuard />
          <StoreProvider>{children}</StoreProvider>
          <footer className="px-4 py-1 text-center text-[10px] text-slate-400" aria-label="Version de l’application">
            OmniKès · v{APP_VERSION}
          </footer>
        </AuthProvider>
      </body>
    </html>
  );
}
