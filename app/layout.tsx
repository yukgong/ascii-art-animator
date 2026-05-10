import type { Metadata } from "next";
import "./globals.css";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";

const geist = Geist({ subsets: ['latin'], variable: '--font-sans' });

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://ascii-art-animator-app.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "ASCII Art Animator — Turn Images & GIFs into ASCII Art",
    template: "%s | ASCII Art Animator",
  },
  description:
    "Free online tool to convert images and GIFs into animated ASCII art. Customize character sets, preprocessing effects, dithering, and export as GIF, WebM, PNG, or React component.",
  keywords: [
    "ASCII art",
    "ASCII animator",
    "image to ASCII",
    "GIF to ASCII",
    "ASCII art generator",
    "ASCII art converter",
    "animated ASCII art",
    "ASCII art online",
    "ASCII art tool",
  ],
  authors: [{ name: "ASCII Art Animator" }],
  creator: "ASCII Art Animator",
  openGraph: {
    type: "website",
    url: siteUrl,
    title: "ASCII Art Animator — Turn Images & GIFs into ASCII Art",
    description:
      "Free online tool to convert images and GIFs into animated ASCII art. Customize character sets, preprocessing effects, and export as GIF, WebM, or React component.",
    siteName: "ASCII Art Animator",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "ASCII Art Animator — animated ASCII art from any image",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "ASCII Art Animator — Turn Images & GIFs into ASCII Art",
    description:
      "Free online tool to convert images and GIFs into animated ASCII art. Export as GIF, WebM, PNG, or React component.",
    images: ["/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  alternates: {
    canonical: siteUrl,
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "ASCII Art Animator",
  url: siteUrl,
  description:
    "Free online tool to convert images and GIFs into animated ASCII art. Customize character sets, preprocessing effects, dithering, and export as GIF, WebM, PNG, or React component.",
  applicationCategory: "DesignApplication",
  operatingSystem: "Any",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
  featureList: [
    "Image to ASCII art conversion",
    "GIF to animated ASCII art",
    "Customizable character sets",
    "Floyd-Steinberg dithering",
    "Export as GIF, WebM, PNG",
    "Export as React component",
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={cn("font-sans", geist.variable)}>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className="antialiased bg-background text-foreground">
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster richColors position="bottom-right" />
      </body>
    </html>
  );
}
