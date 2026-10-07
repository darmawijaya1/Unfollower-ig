"use client";

import { useState } from "react";
import type { IgUser } from "@/lib/types";

const PAGE = 100;

function Avatar({ user }: { user: IgUser }) {
  const [failed, setFailed] = useState(false);
  if (user.profilePicUrl && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={user.profilePicUrl}
        alt=""
        width={40}
        height={40}
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className="size-10 shrink-0 rounded-full bg-slate-200 object-cover dark:bg-slate-800"
      />
    );
  }
  return (
    <span
      aria-hidden
      className="grid size-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-fuchsia-500/20 to-orange-400/20 text-sm font-semibold uppercase text-fuchsia-700 dark:text-fuchsia-300"
    >
      {user.username.replace(/[^a-z0-9]/gi, "").charAt(0) || "?"}
    </span>
  );
}

export function UserList({ users, emptyText }: { users: IgUser[]; emptyText: string }) {
  const [shown, setShown] = useState(PAGE);

  if (users.length === 0) {
    return <p className="px-4 py-10 text-center text-sm text-slate-500">{emptyText}</p>;
  }

  return (
    <>
      <ul className="divide-y divide-slate-100 dark:divide-slate-800">
        {users.slice(0, shown).map((user) => (
          <li key={user.id ?? user.username} className="flex items-center gap-3 px-4 py-3">
            <Avatar user={user} />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 truncate text-sm font-semibold">
                <span className="truncate">{user.username}</span>
                {user.isVerified && (
                  <span title="Terverifikasi" className="text-sky-500">
                    ✔
                  </span>
                )}
                {user.isPrivate && (
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                    Privat
                  </span>
                )}
              </p>
              {user.fullName && <p className="truncate text-xs text-slate-500 dark:text-slate-400">{user.fullName}</p>}
            </div>
            <a
              href={`https://www.instagram.com/${encodeURIComponent(user.username)}/`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-ghost shrink-0 !px-2.5 !py-1.5 text-xs"
            >
              Buka profil ↗
            </a>
          </li>
        ))}
      </ul>
      {shown < users.length && (
        <div className="border-t border-slate-100 p-3 text-center dark:border-slate-800">
          <button type="button" className="btn-ghost" onClick={() => setShown((n) => n + PAGE)}>
            Tampilkan lebih banyak ({users.length - shown} lagi)
          </button>
        </div>
      )}
    </>
  );
}
