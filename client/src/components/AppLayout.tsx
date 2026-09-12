import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { ROLE_LABELS, Role } from '@ues/shared';
import { useAuth } from '@/hooks/use-auth';
import { NAV_FOR_ROLE, paths } from '@/routes/paths';

/**
 * The signed-in shell.
 *
 * The header always names the college the current user belongs to. That is a deliberate
 * product decision as much as a design one: in a system where the same screens serve
 * many colleges, the tenant should never be ambiguous to the person using it.
 */
export function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [isSigningOut, setIsSigningOut] = useState(false);

  if (!user) return null;

  const handleLogout = async () => {
    setIsSigningOut(true);
    try {
      await logout();
      void navigate(paths.login, { replace: true });
    } finally {
      setIsSigningOut(false);
    }
  };

  const isUniversity = user.role === Role.UniversityAdmin;
  const navItems = NAV_FOR_ROLE[user.role];

  return (
    <div className="min-h-screen bg-slate-50">
      {/*
        Skip link. Visually hidden until focused, so a keyboard or screen-reader user can
        jump past the header and navigation instead of tabbing through them on every
        page. `sr-only` plus `focus:not-sr-only` is the standard pattern.
      */}
      <a
        href="#main-content"
        className="sr-only rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50"
      >
        Skip to main content
      </a>

      <header className="no-print border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <p className="text-xs font-semibold tracking-wide text-brand-600 uppercase">
              University of Mumbai
            </p>
            <p className="truncate text-sm font-medium text-slate-900">
              {isUniversity
                ? 'All affiliated colleges'
                : (user.college?.name ?? 'Unassigned')}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-sm font-medium text-slate-900">{user.fullName}</p>
              <p className="text-xs text-slate-500">
                {ROLE_LABELS[user.role]}
                {user.college && !isUniversity ? ` · ${user.college.code}` : ''}
              </p>
            </div>

            <button
              type="button"
              onClick={() => void handleLogout()}
              disabled={isSigningOut}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:opacity-60"
            >
              {isSigningOut ? 'Signing out…' : 'Sign out'}
            </button>
          </div>
        </div>

        {/* A single-item navigation is noise, so it appears only once a role has more
            than one destination. Roles gain entries as later phases add pages. */}
        {navItems.length > 1 && (
          <nav
            aria-label="Sections"
            className="mx-auto max-w-6xl overflow-x-auto px-4 sm:px-6"
          >
            <ul className="flex gap-1">
              {navItems.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    // `end` stops the parent path matching every child route, which
                    // would otherwise highlight two tabs at once.
                    end
                    className={({ isActive }) =>
                      `-mb-px inline-block border-b-2 px-3 py-2 text-sm font-medium transition ${
                        isActive
                          ? 'border-brand-600 text-brand-700'
                          : 'border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900'
                      }`
                    }
                  >
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </header>

      <main
        id="main-content"
        // `tabIndex={-1}` makes the element focusable by the skip link without adding it
        // to the normal tab order.
        tabIndex={-1}
        className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8 focus:outline-none"
      >
        <Outlet />
      </main>
    </div>
  );
}
