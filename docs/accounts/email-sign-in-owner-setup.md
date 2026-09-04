# Email sign-in: the one dashboard change that makes it work anywhere

Supabase's Magic Link template decides which of two completely different flows
your players get. The provider's own reference is blunt about it:

> If the `{{ .ConfirmationURL }}` variable is specified in the email template, a
> magiclink will be sent. If the `{{ .Token }}` variable is specified in the
> email template, an OTP will be sent.

The stock template contains only `{{ .ConfirmationURL }}`, so it sends a link.
A link is the worse of the two options here, for three independent reasons:

1. **It only finishes in the browser that asked for it.** The code it hands back
   is PKCE, and the matching verifier never leaves that browser's storage. Mail
   apps open links in the system browser, which is usually not the one the
   player was using. Nothing is recoverable at that point: the link is spent.
2. **Mail providers spend it before anyone sees it.** Spam and safety scanners
   fetch the links in incoming mail. Supabase documents this directly, and its
   first recommended remedy is to send a code instead. A token consumed with no
   session created is the signature of exactly this.
3. **It depends on Site URL and the redirect allow list being right.** A code
   depends on neither.

A code has none of those failure modes. It is redeemed with the address that
asked for it, so it works on any device, in any browser, with no redirect
involved at all.

## The change

Dashboard → Authentication → Email Templates → **Magic Link**.

Subject:

```
{{ .Token }} is your EraClash sign-in code
```

Message:

```html
<h2>Your EraClash sign-in code</h2>
<p>Enter this code to sign in:</p>
<p style="font-size:30px;letter-spacing:6px;font-weight:700;">{{ .Token }}</p>
<p>It expires in an hour and can only be used once. If you did not ask to sign
in, you can ignore this message.</p>
```

Putting the code in the subject line means it is readable from a notification,
without opening the message at all.

Nothing in the product needs to change to match this. The dialog's field already
takes a code, and it also still accepts a pasted link address, so any link that
is already in flight keeps working.

## What stays true either way

- No password field exists anywhere in this product, so there is nothing to
  store, leak or reset.
- The code is verified by the provider over a POST. It never travels in a URL,
  never lands in browser history, and never appears in a screenshot of the
  address bar.
- `src/accounts/linkProof.js` decides what a pasted value is and how it may be
  redeemed. It prefers the proofs that work on any device over the one bound to
  a single browser, and it never invents an address for a proof that needs one.

## Rate limits worth knowing

The built-in mail service is for testing and is deliberately slow: a minimum
interval between sends to one address, and a low hourly cap. "Too many attempts
just now" is that limit, not a defect. Retrying in a loop only pushes the window
further out. For real testers, configure custom SMTP, which raises the cap and
takes delivery out of Supabase's shared reputation.
