// Sends the sign-in links through Resend's HTTP API.
//
// No SDK on purpose: one fetch call keeps the server's dependency list at three
// packages. With no API key configured the module no-ops and logs the link
// instead, so local runs and a key-less deploy still work end to end.
let apiKey = null;
let fromAddress = null;
let baseUrl = null;

const TEXT = {
  en: {
    subject: "Your RuneBags sign-in link",
    heading: "Sign in to RuneBags",
    body: "Click the button below to sign in. The link works once and expires in 20 minutes.",
    button: "Sign in",
    ignore: "If you didn't ask for this, you can ignore this email — nothing was created.",
  },
  fr: {
    subject: "Votre lien de connexion RuneBags",
    heading: "Connexion à RuneBags",
    body: "Cliquez sur le bouton ci-dessous pour vous connecter. Le lien est à usage unique et expire dans 20 minutes.",
    button: "Se connecter",
    ignore: "Si vous n'avez pas demandé ce lien, ignorez ce courriel — rien n'a été créé.",
  },
};

export function initMailer(env) {
  apiKey = String(env.RESEND_API_KEY || "").trim() || null;
  fromAddress = String(env.MAIL_FROM || "").trim() || null;
  baseUrl = String(env.APP_BASE_URL || "").trim().replace(/\/+$/, "") || null;

  if (!apiKey || !fromAddress || !baseUrl) {
    console.warn("[mail] RESEND_API_KEY / MAIL_FROM / APP_BASE_URL missing — sign-in links will be logged, not sent");
    return false;
  }
  console.log("[mail] Resend ready");
  return true;
}

export function isMailerReady() {
  return Boolean(apiKey && fromAddress && baseUrl);
}

export function buildLoginUrl(token) {
  const root = baseUrl || "";
  return `${root}/?login=${encodeURIComponent(token)}`;
}

export async function sendLoginLink(email, token, lang) {
  const url = buildLoginUrl(token);
  const copy = TEXT[lang === "fr" ? "fr" : "en"];

  if (!isMailerReady()) {
    // Without a mail provider the link still has to be reachable somehow, so it
    // goes to the server log. Never do this on a public deploy.
    console.warn(`[mail] would send to ${email}: ${url}`);
    return false;
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromAddress,
        to: [email],
        subject: copy.subject,
        html: renderEmail(copy, url),
      }),
    });

    if (!response.ok) {
      console.warn(`[mail] send failed (${response.status}): ${(await response.text()).slice(0, 200)}`);
      return false;
    }
    return true;
  } catch (error) {
    console.warn(`[mail] send threw: ${error?.message || error}`);
    return false;
  }
}

function renderEmail(copy, url) {
  const safeUrl = escapeHtml(url);
  return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#0f131a;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#f2e6c8">
  <div style="max-width:480px;margin:0 auto;background:#161c26;border:1px solid #263041;border-radius:16px;padding:28px">
    <h1 style="margin:0 0 12px;font-size:20px;letter-spacing:.08em;text-transform:uppercase">${escapeHtml(copy.heading)}</h1>
    <p style="margin:0 0 20px;line-height:1.55;color:#c7cedb">${escapeHtml(copy.body)}</p>
    <p style="margin:0 0 24px">
      <a href="${safeUrl}" style="display:inline-block;padding:12px 22px;border-radius:10px;background:#d4af58;color:#20170a;font-weight:600;text-decoration:none">${escapeHtml(copy.button)}</a>
    </p>
    <p style="margin:0;font-size:12px;line-height:1.5;color:#8b95a6">${escapeHtml(copy.ignore)}</p>
    <p style="margin:16px 0 0;font-size:11px;word-break:break-all;color:#5f6a7d">${safeUrl}</p>
  </div>
</body></html>`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
