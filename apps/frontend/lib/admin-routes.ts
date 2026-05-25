export function isAdminConsoleActive(pathname: string): boolean {
  return (
    pathname === '/admin' ||
    pathname === '/admin/console' ||
    pathname.startsWith('/admin/console/')
  );
}

export function isNavItemActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
