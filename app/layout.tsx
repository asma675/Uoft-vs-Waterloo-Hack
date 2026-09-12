import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "TrustMesh — Zero-Trust Browser Swarm",
  description: "The zero-trust verification and safety layer for autonomous browser agents. Built on Steel browser infrastructure.",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className="antialiased">{children}</body>
    </html>
  )
}
