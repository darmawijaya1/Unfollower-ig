export interface IgUser {
  /** ID numerik Instagram (tidak tersedia jika data berasal dari file export). */
  id?: string;
  username: string;
  fullName?: string;
  profilePicUrl?: string;
  isPrivate?: boolean;
  isVerified?: boolean;
}

export type ListType = "followers" | "following";

export interface ListPage {
  users: IgUser[];
  /** `null` jika sudah halaman terakhir. */
  nextCursor: string | null;
}

export interface SessionUser {
  userId: string;
  username: string;
}

export interface ProfileInfo {
  username: string;
  fullName?: string;
  profilePicUrl?: string;
  followerCount?: number;
  followingCount?: number;
}

export type AuthErrorCode =
  | "invalid_credentials"
  | "invalid_code"
  | "checkpoint"
  | "rate_limited"
  | "session_expired"
  | "bad_request"
  | "server_misconfigured"
  | "unknown";

export type LoginResponse =
  | { status: "ok"; user: SessionUser }
  | { status: "two_factor"; method: "totp" | "sms" | "unknown"; phoneHint?: string }
  | { status: "error"; code: AuthErrorCode; message: string };
