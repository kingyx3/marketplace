import Link from "next/link";

const footerLinks = [
  ["Shipping", "/shipping"],
  ["Returns", "/returns"],
  ["Contact", "/contact"],
  ["Privacy", "/privacy"],
  ["Terms", "/terms"],
  ["Cookies", "/cookies"],
  ["Accessibility", "/accessibility"],
] as const;

export function SiteFooter({ appName }: { appName: string }) {
  return (
    <footer className="border-t border-zinc-200 bg-zinc-50">
      <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-6 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="shrink-0">
          <p className="font-semibold text-zinc-950">{appName}</p>
          <p className="mt-1 text-xs text-zinc-500">
            © {new Date().getUTCFullYear()} {appName}. All rights reserved.
          </p>
        </div>

        <nav
          aria-label="Footer navigation"
          className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-zinc-600 lg:justify-end"
        >
          {footerLinks.map(([label, href]) => (
            <Link key={href} href={href} className="hover:text-zinc-950">
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
