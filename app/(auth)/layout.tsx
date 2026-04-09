/**
 * Auth layout — centered, minimal container for sign-in/sign-up pages.
 * No TopBar or sidebar, just the auth form against the base background.
 * @param props - Layout props with children.
 * @returns Centered auth page container.
 */
export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center px-4">
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
