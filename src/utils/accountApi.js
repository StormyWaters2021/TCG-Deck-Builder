const ACCOUNT_API = (
  import.meta.env.VITE_ACCOUNT_API || "http://localhost:8787"
).replace(/\/$/, "");

export function getGoogleLoginUrl() {
  return `${ACCOUNT_API}/api/auth/login/google`;
}

export function getGoogleLinkUrl() {
  return `${ACCOUNT_API}/api/auth/link/google`;
}

export async function fetchCurrentUser() {
  const response = await fetch(`${ACCOUNT_API}/api/auth/me`, {
    method: "GET",
    credentials: "include",
    cache: "no-store",
    headers: {
      Accept: "application/json",
    },
  });

  if (response.status === 401) {
    return null;
  }

  if (!response.ok) {
    throw new Error(
      `Unable to check account status (${response.status})`,
    );
  }

  const result = await response.json();

  return result.authenticated ? result.user : null;
}

export async function fetchPendingAccountMerge(
  mergeToken,
) {
  const response = await fetch(
    `${ACCOUNT_API}/api/auth/merge/pending?token=${encodeURIComponent(
      mergeToken,
    )}`,
    {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      headers: {
        Accept: "application/json",
      },
    },
  );

  const result = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      result?.error || "Unable to load merge details",
    );
  }

  return result.merge;
}

export async function confirmAccountMerge(
  mergeToken,
) {
  const response = await fetch(
    `${ACCOUNT_API}/api/auth/merge/confirm`,
    {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        mergeToken,
      }),
    },
  );

  const result = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      result?.error || "Unable to merge accounts",
    );
  }

  return result;
}

export async function updateCurrentUserDisplayName(
  displayName,
) {
  const response = await fetch(
    `${ACCOUNT_API}/api/auth/profile`,
    {
      method: "PATCH",
      credentials: "include",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        displayName,
      }),
    },
  );

  const result = await response.json().catch(() => null);

  if (!response.ok) {
    const errorCode = result?.error;

    if (errorCode === "invalid_display_name") {
      throw new Error(
        "Display name must be between 1 and 50 characters.",
      );
    }

    if (
      errorCode === "invalid_session" ||
      errorCode === "not_authenticated"
    ) {
      throw new Error(
        "Your session has expired. Please sign in again.",
      );
    }

    throw new Error(
      `Unable to update display name (${response.status})`,
    );
  }

  return result.user;
}

export async function updateCurrentUserAvatarProvider(
  avatarProvider,
) {
  const response = await fetch(
    `${ACCOUNT_API}/api/auth/profile`,
    {
      method: "PATCH",
      credentials: "include",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        avatarProvider,
      }),
    },
  );

  const result = await response.json().catch(() => null);

  if (!response.ok) {
    const errorCode = result?.error;

    if (errorCode === "invalid_avatar_provider") {
      throw new Error(
        "That avatar provider is not valid.",
      );
    }

    if (errorCode === "provider_not_linked") {
      throw new Error(
        "That account is not linked or does not have an available avatar.",
      );
    }

    if (
      errorCode === "invalid_session" ||
      errorCode === "not_authenticated"
    ) {
      throw new Error(
        "Your session has expired. Please sign in again.",
      );
    }

    throw new Error(
      `Unable to update avatar (${response.status})`,
    );
  }

  return result.user;
}


export function getDiscordLoginUrl() {
  return `${ACCOUNT_API}/api/auth/login/discord`;
}

export function getDiscordLinkUrl() {
  return `${ACCOUNT_API}/api/auth/link/discord`;
}

export async function logoutCurrentUser() {
  const response = await fetch(`${ACCOUNT_API}/api/auth/logout`, {
    method: "POST",
    credentials: "include",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Unable to log out (${response.status})`);
  }
}