/**
 * ===========================================================================
 *  EMAIL LAYOUT — one premium shell, rendered as HTML and as plain text
 * ===========================================================================
 *
 * Email HTML is its own discipline. The rules this file keeps that the web app
 * never has to:
 *
 *   - TABLES AND INLINE STYLES. Gmail drops <style> in some views and desktop
 *     Outlook renders with Word, so everything that must survive — colour,
 *     spacing, direction — is inline, on a table. The <style> block only adds
 *     mobile refinements for the clients that honour it.
 *   - RTL IS DECLARED EVERYWHERE. dir="rtl" on <html>, <body> and every table,
 *     plus explicit right alignment: several clients reset direction at a table
 *     boundary, and Outlook ignores the inherited value.
 *   - FIGURES ARE ISOLATED. Times, prices and phone numbers go through ltr() —
 *     the same bidi rule as client/src/lib/bidi.jsx, for the same reason.
 *   - EVERY VALUE IS ESCAPED. A client's name is user input. In an inbox it
 *     cannot run a script, but unescaped it could still inject a link.
 *
 * Content is written once, as `rich` values that carry both renderings, so the
 * plain-text alternative can never drift away from the design.
 */

/** Mirrors client/tailwind.config.js — the inbox is the same room as the site. */
export const PALETTE = {
  cream: '#FDFAF4',
  shell: '#F7F0E6',
  sand: '#ECE0CC',
  haze: '#A39284',
  cocoa: '#6F5A48',
  espresso: '#2A211A',
  white: '#FFFFFF',
};

/**
 * One accent per kind of message.
 *   base    the ticket's leading bar and the signature strip
 *   soft    chip and callout grounds
 *   ink     text on `soft` — darkened where the brand shade misses 4.5:1
 *   button  solid-button fill under white text, also ≥ 4.5:1 — which is why
 *           citrus hands its button to espresso instead of white-on-orange
 */
export const TONES = {
  mint: { base: '#1FB598', soft: '#DFF5F0', ink: '#0B6B57', button: '#0F8068' },
  pomegranate: { base: '#E0483B', soft: '#FDE9E6', ink: '#B4332A', button: '#B4332A' },
  azure: { base: '#2F6FD0', soft: '#E5EDFB', ink: '#1F4E99', button: '#1F4E99' },
  citrus: { base: '#F2A03C', soft: '#FDF1DE', ink: '#8A5412', button: '#2A211A' },
  grape: { base: '#7A5CB0', soft: '#EFE9F8', ink: '#553A85', button: '#553A85' },
};

// Assistant is the site's face. Clients that ignore web fonts (Gmail, Outlook)
// fall to Segoe UI / Arial, both of which carry proper Hebrew.
const SANS = "'Assistant','Segoe UI',Tahoma,Arial,sans-serif";
const FIGURES = "'Inter','Segoe UI',Tahoma,Arial,sans-serif";
const RLM = '\u200F';

// ---------------------------------------------------------------------------
// Rich values: one piece of content, two renderings
// ---------------------------------------------------------------------------

const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ENTITIES[c]);

const RICH = Symbol('rich');
const make = (html, text) => ({ [RICH]: true, html, text });

export function toRich(value) {
  if (value && value[RICH]) return value;
  if (value === null || value === undefined || value === false || value === '') return make('', '');
  return make(esc(value), String(value));
}

/** Tagged template: literals and values become { html, text }, escaped on the way. */
export function rich(strings, ...values) {
  let html = '';
  let text = '';
  strings.forEach((literal, i) => {
    html += esc(literal);
    text += literal;
    if (i < values.length) {
      const piece = toRich(values[i]);
      html += piece.html;
      text += piece.text;
    }
  });
  return make(html, text);
}

/** "14:30", "120 ₪", "03-123-4567" — an LTR island inside the Hebrew line. */
/**
 * A left-to-right island inside Hebrew: a time, a price, a phone number, an
 * email. Short values never break in the middle ("14:00", "050-123-4567");
 * long ones — an email address, a URL — may break anywhere, because a single
 * unbreakable one widens the card past a phone's screen.
 */
export const ltr = (value) => {
  const text = String(value);
  const short = text.length <= 24 && !/\s/.test(text);
  const flow = short ? 'white-space:nowrap;' : 'overflow-wrap:anywhere;word-break:break-word;';
  return make(`<span dir="ltr" style="direction:ltr;unicode-bidi:isolate;${flow}">${esc(value)}</span>`, text);
};

/** User-typed text (a client's name) resolves its own direction. */
export const auto = (value) =>
  make(
    `<span dir="auto" style="unicode-bidi:isolate;overflow-wrap:anywhere;word-break:break-word;">${esc(value)}</span>`,
    String(value)
  );

const safeHref = (href) => typeof href === 'string' && /^(https?:|tel:|mailto:)/i.test(href);

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------

// Every text cell wraps a long word — an email address, a URL, a long street
// name — instead of widening the card (an unbreakable email once pushed the
// barber's alert to 778px, even on desktop).
const WRAP = 'word-break:break-word;overflow-wrap:anywhere;word-wrap:break-word;';
const BOX = 'box-sizing:border-box;';
// A compact, receipt-like scale: a whole confirmation should fit on a phone
// screen without scrolling. Phones get 14px sides through the <style> block;
// where that block is ignored, 20px still fits a 320px screen.
const PAD_X = 20;

const row = (inner, { top = 0, style = '' }) =>
  `<tr><td class="lb-pad" align="right" dir="rtl" style="padding:${top}px ${PAD_X}px 0;${BOX}font-family:${SANS};${WRAP}${style}">${inner}</td></tr>`;

function chip(label, tone) {
  return `<table role="presentation" border="0" cellpadding="0" cellspacing="0" dir="rtl" style="border-collapse:separate;"><tr><td style="border-radius:999px;background-color:${tone.soft};padding:3px 9px;font-family:${SANS};font-size:11px;line-height:14px;font-weight:700;color:${tone.ink};">${esc(label)}</td></tr></table>`;
}

/**
 * The ticket: date in words, the time large, a torn edge, then the details.
 * The accent bar sits on the RIGHT border — the leading edge in RTL. The
 * details table is table-layout:fixed, so no value can widen its column.
 */
function ticket(t, tone) {
  const rows = (t.rows ?? []).filter(Boolean);
  if (!t.time && !rows.length) return '';

  const head = t.time
    ? `<tr><td align="right" dir="rtl" style="padding:11px 14px ${rows.length ? 9 : 11}px;${BOX}font-family:${SANS};${WRAP}">${
        t.dateWords
          ? `<div style="font-size:12px;line-height:16px;font-weight:700;color:${PALETTE.cocoa};">${toRich(t.dateWords).html}</div>`
          : ''
      }<div class="lb-time" style="margin-top:1px;font-family:${FIGURES};font-size:28px;line-height:32px;font-weight:600;letter-spacing:-0.6px;color:${PALETTE.espresso};">${ltr(t.time).html}</div></td></tr>`
    : '';

  const tear =
    head && rows.length
      ? `<tr><td style="padding:0 14px;"><div style="height:0;border-top:1px dashed ${PALETTE.sand};font-size:0;line-height:0;">&nbsp;</div></td></tr>`
      : '';

  const details = rows.length
    ? `<tr><td style="padding:${head ? 6 : 10}px 14px 9px;${BOX}"><table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" dir="rtl" style="width:100%;table-layout:fixed;">${rows
        .map(
          ([label, value]) =>
            `<tr><td width="28%" align="right" valign="top" style="width:28%;padding:2px 0 2px 8px;font-family:${SANS};font-size:12px;line-height:17px;color:${PALETTE.cocoa};${WRAP}">${esc(label)}</td><td align="right" valign="top" style="padding:2px 0;font-family:${SANS};font-size:13px;line-height:17px;font-weight:700;color:${PALETTE.espresso};${WRAP}">${toRich(value).html}</td></tr>`
        )
        .join('')}</table></td></tr>`
    : '';

  return `<tr><td class="lb-pad" style="padding:12px ${PAD_X}px 0;${BOX}"><table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" dir="rtl" style="width:100%;${BOX}table-layout:fixed;background-color:${PALETTE.white};border:1px solid ${PALETTE.sand};border-right:4px solid ${tone.base};border-radius:12px;border-collapse:separate;">${head}${tear}${details}</table></td></tr>`;
}

function callout(c, fallback) {
  const tone = TONES[c.tone] ?? fallback;
  const title = c.title
    ? `<div style="font-size:13px;line-height:19px;font-weight:800;">${toRich(c.title).html}</div>`
    : '';
  const body = c.body
    ? `<div style="${c.title ? 'margin-top:1px;' : ''}font-size:12px;line-height:18px;">${toRich(c.body).html}</div>`
    : '';
  return `<tr><td class="lb-pad" style="padding:10px ${PAD_X}px 0;${BOX}"><table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" dir="rtl" style="width:100%;${BOX}table-layout:fixed;background-color:${tone.soft};border-radius:10px;border-collapse:separate;"><tr><td align="right" dir="rtl" style="padding:9px 12px;${BOX}font-family:${SANS};color:${tone.ink};${WRAP}">${title}${body}</td></tr></table></td></tr>`;
}

/**
 * Compact pills that WRAP: each is its own small table floated right
 * (align="right" — understood by Gmail, Apple Mail and Outlook alike), so the
 * pills share a line on a wide screen and fold onto the next line on a narrow
 * one. They can never push the card wider, as the old one-row layout did. The
 * fill sits on the cell, so Outlook keeps it; the first action is the filled one.
 */
function buttons(actions, tone) {
  const pills = actions.map((action) => {
    const solid = action.variant !== 'outline';
    const fill = solid ? tone.button : PALETTE.white;
    const ink = solid ? PALETTE.white : PALETTE.espresso;
    const edge = solid ? tone.button : PALETTE.sand;
    return `<table role="presentation" align="right" border="0" cellpadding="0" cellspacing="0" dir="rtl" style="max-width:100%;margin:0 0 6px 6px;border-collapse:separate;"><tr><td align="center" bgcolor="${fill}" style="border-radius:999px;background-color:${fill};mso-padding-alt:7px 14px;"><a href="${esc(action.href)}" target="_blank" rel="noopener" style="display:inline-block;${BOX}padding:7px 14px;border:1px solid ${edge};border-radius:999px;font-family:${SANS};font-size:13px;line-height:16px;font-weight:700;color:${ink};text-decoration:none;${WRAP}">${esc(action.label)}</a></td></tr></table>`;
  });
  return `${pills.join('')}<div style="clear:both;height:0;line-height:0;font-size:0;">&nbsp;</div>`;
}

/** The four service colours from the price list, across the top of the card. */
function strip() {
  const colours = [TONES.pomegranate.base, TONES.azure.base, TONES.citrus.base, TONES.mint.base];
  const cells = colours.map((colour, i) => {
    const corner =
      i === 0 ? 'border-top-right-radius:15px;' : i === colours.length - 1 ? 'border-top-left-radius:15px;' : '';
    return `<td width="25%" height="4" style="height:4px;${corner}background-color:${colour};font-size:0;line-height:0;">&nbsp;</td>`;
  });
  return `<tr><td style="padding:0;"><table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" dir="rtl" style="width:100%;table-layout:fixed;"><tr>${cells.join('')}</tr></table></td></tr>`;
}

function brand(shop) {
  const mark = (Array.from(shop.name.trim())[0] ?? '•').toUpperCase();
  return `<tr><td align="right" dir="rtl" style="padding:0 2px 10px;"><table role="presentation" border="0" cellpadding="0" cellspacing="0" dir="rtl"><tr><td width="28" height="28" align="center" valign="middle" style="width:28px;height:28px;border-radius:8px;background-color:${PALETTE.espresso};font-family:${SANS};font-size:14px;line-height:28px;font-weight:800;color:${PALETTE.cream};">${esc(mark)}</td><td style="padding-right:8px;font-family:${SANS};font-size:14px;line-height:18px;font-weight:800;letter-spacing:-0.1px;color:${PALETTE.espresso};${WRAP}">${esc(shop.name)}</td></tr></table></td></tr>`;
}

function footer(shop, reason, unsubscribe) {
  const phone = shop.phoneDisplay
    ? shop.phoneHref
      ? `<a href="${esc(shop.phoneHref)}" style="color:${PALETTE.cocoa};text-decoration:none;">${ltr(shop.phoneDisplay).html}</a>`
      : ltr(shop.phoneDisplay).html
    : null;
  const link = (href, label) => `<a href="${esc(href)}" style="color:${PALETTE.cocoa};text-decoration:underline;white-space:nowrap;">${label}</a>`;
  const line = [
    `<strong style="font-weight:700;">${esc(shop.name)}</strong>`,
    shop.address && esc(shop.address),
    phone,
    shop.waze && link(shop.waze, 'ניווט ב־Waze'),
    shop.instagram && link(shop.instagram, 'אינסטגרם'),
  ]
    .filter(Boolean)
    .join(`<span style="color:${PALETTE.haze};">&nbsp;·&nbsp;</span>`);
  return `<tr><td align="center" dir="rtl" style="padding:12px 8px 0;${BOX}font-family:${SANS};font-size:11px;line-height:16px;color:${PALETTE.cocoa};${WRAP}">${line}${reason ? `<br>${esc(reason)}` : ''}${unsubscribe ? `<br><a href="${esc(unsubscribe)}" style="color:${PALETTE.cocoa};text-decoration:underline;">להסרה מרשימת התפוצה</a>` : ''}</td></tr>`;
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

function renderHtml(msg, tone, parts) {
  const { shop } = msg;
  const body = [
    msg.chip && row(chip(msg.chip, tone), { top: 16 }),
    row(
      `<h1 class="lb-h1" style="margin:0;font-family:${SANS};font-size:20px;line-height:26px;font-weight:800;letter-spacing:-0.2px;color:${PALETTE.espresso};${WRAP}">${parts.title.html}</h1>`,
      { top: msg.chip ? 8 : 16 }
    ),
    parts.intro && row(parts.intro.html, { top: 4, style: `font-size:13px;line-height:20px;color:${PALETTE.cocoa};` }),
    parts.ticket && ticket(parts.ticket, tone),
    parts.callout && callout(parts.callout, tone),
    parts.actions.length > 0 && row(buttons(parts.actions, tone), { top: 14 }),
    parts.secondary &&
      row(
        `<a href="${esc(parts.secondary.href)}" target="_blank" rel="noopener" style="color:${PALETTE.cocoa};text-decoration:underline;">${esc(parts.secondary.label)}</a>`,
        { top: 8, style: 'font-size:12px;line-height:17px;' }
      ),
    parts.note && row(parts.note.html, { top: 10, style: `font-size:12px;line-height:18px;color:${PALETTE.cocoa};` }),
    '<tr><td style="height:16px;line-height:16px;font-size:0;">&nbsp;</td></tr>',
  ]
    .filter(Boolean)
    .join('\n');

  return `<!doctype html>
<html lang="he" dir="rtl" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="format-detection" content="telephone=no,date=no,address=no,email=no,url=no">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>${esc(msg.subject)}</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
<link href="https://fonts.googleapis.com/css2?family=Assistant:wght@400;600;700;800&family=Inter:wght@500;600&display=swap" rel="stylesheet">
<style>
:root{color-scheme:light only;supported-color-schemes:light only;}
*{box-sizing:border-box;}
body{margin:0;padding:0;width:100%!important;background-color:${PALETTE.shell};}
td,h1,a{word-break:break-word;overflow-wrap:anywhere;}
a[x-apple-data-detectors]{color:inherit!important;text-decoration:none!important;}
/* Refinements only: every layout guarantee above is inline, for the clients that drop this block. */
@media screen and (max-width:600px){
.lb-shell{padding:10px 6px 16px!important;}
.lb-pad{padding-left:14px!important;padding-right:14px!important;}
.lb-h1{font-size:18px!important;line-height:24px!important;}
.lb-time{font-size:26px!important;line-height:30px!important;}
}
</style>
</head>
<body dir="rtl" style="margin:0;padding:0;width:100%;background-color:${PALETTE.shell};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${esc(msg.preheader ?? '')}${'&#847;&zwnj;&nbsp;'.repeat(60)}</div>
<table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" dir="rtl" style="width:100%;background-color:${PALETTE.shell};">
<tr><td class="lb-shell" align="center" style="padding:20px 10px 24px;${BOX}">
<!--[if mso]><table role="presentation" width="560" align="center" border="0" cellpadding="0" cellspacing="0"><tr><td><![endif]-->
<table role="presentation" width="100%" align="center" border="0" cellpadding="0" cellspacing="0" dir="rtl" style="width:100%;max-width:560px;margin:0 auto;${BOX}">
${brand(shop)}
<tr><td style="padding:0;">
<table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" dir="rtl" style="width:100%;${BOX}table-layout:fixed;background-color:${PALETTE.cream};border:1px solid ${PALETTE.sand};border-radius:16px;border-collapse:separate;box-shadow:0 8px 24px -16px rgba(112,74,52,0.30);">
${strip()}
${body}
</table>
</td></tr>
${footer(shop, msg.reason, msg.unsubscribe)}
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</body>
</html>`;
}

function renderText(msg, parts) {
  const out = [];
  const line = (value = '') => out.push(value ? `${RLM}${value}` : '');
  const { shop } = msg;

  line(shop.name);
  line();
  if (msg.chip) line(`[${msg.chip}]`);
  line(parts.title.text);
  if (parts.intro) {
    line();
    line(parts.intro.text);
  }

  const t = parts.ticket;
  if (t) {
    line();
    if (t.time) line([t.dateWords && toRich(t.dateWords).text, t.time].filter(Boolean).join(' · '));
    for (const [label, value] of (t.rows ?? []).filter(Boolean)) line(`${label}: ${toRich(value).text}`);
  }

  if (parts.callout) {
    line();
    if (parts.callout.title) line(toRich(parts.callout.title).text);
    if (parts.callout.body) line(toRich(parts.callout.body).text);
  }

  if (parts.actions.length || parts.secondary) line();
  for (const action of parts.actions) line(`${action.label}: ${action.href}`);
  if (parts.secondary) line(`${parts.secondary.label}: ${parts.secondary.href}`);

  if (parts.note) {
    line();
    line(parts.note.text);
  }

  line();
  line('—');
  line([shop.name, shop.address, shop.phoneDisplay].filter(Boolean).join(' · '));
  if (shop.instagram) line(shop.instagram);
  if (msg.reason) line(msg.reason);
  if (msg.unsubscribe) line(`להסרה מרשימת התפוצה: ${msg.unsubscribe}`);

  return out.join('\n');
}

/**
 * @param {object} msg  { subject, preheader, tone, chip, title, intro, ticket,
 *                        callout, actions, secondary, note, reason, shop }
 * @returns {{ html: string, text: string }}
 */
export function renderLayout(msg) {
  const tone = TONES[msg.tone] ?? TONES.mint;
  const parts = {
    title: toRich(msg.title),
    intro: msg.intro ? toRich(msg.intro) : null,
    note: msg.note ? toRich(msg.note) : null,
    ticket: msg.ticket ?? null,
    callout: msg.callout ?? null,
    actions: (msg.actions ?? []).filter((a) => a && safeHref(a.href)),
    secondary: msg.secondary && safeHref(msg.secondary.href) ? msg.secondary : null,
  };
  return { html: renderHtml(msg, tone, parts), text: renderText(msg, parts) };
}
