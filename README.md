# SplitSnap

Split a restaurant bill from a photo of the receipt. Snap it at the table, check what was read, tap who had what, and send everyone an exact share that adds up to the cent. Built for groups who are tired of doing receipt maths on a phone calculator.

## How it works

1. **Scan.** The photo is shrunk on the device (2000px long edge, JPEG, under 3.5MB) and posted to `/api/scan`. The route calls the OpenAI Responses API with the image as `input_image` and a zod schema through `zodTextFormat`, so Structured Outputs returns typed fields: merchant, date, currency, line items (name, qty, unit price, line total), subtotal, tax, whether tax is already in the prices, tip, service charge, discounts, total and short warnings. The prompt tells the model to transcribe printed numbers as they are and not fix the arithmetic.
2. **Check.** The app does the maths itself (`lib/receipt.ts`). It checks every line (qty x price against the line total, with a small tolerance for rounded unit prices), items against the subtotal, and subtotal plus charges against the total. A confidence banner shows each check, and any line that does not reconcile is highlighted with a one-tap fix. Nothing is hidden: if the receipt still does not add up, the difference is shown and shared out as its own line.
3. **Assign.** Add people, pick one, tap what they had. Tapping several people on one dish splits it evenly. Tax, tip, service and discounts can each be split by what people had or evenly.
4. **Settle.** Per-person totals, who pays whom, and three ways to send it: plain text, a PNG card drawn on a canvas, and a link that carries the whole split in the URL hash (deflate plus base64url). Nothing is stored on a server.

### The money maths

All money is integers in the currency's minor unit (cents, pence, whole yen). Floats only exist at the model boundary, and `toMinor` converts them without drift (1.005 becomes 101). The split in `lib/split.ts` is deterministic:

- A shared dish splits evenly. Leftover cents go to whoever has the lowest running item total, then by the order people were added, so pennies do not pile up on one person.
- Tax, tip, service, discount and any unreconciled difference use the largest remainder method with BigInt arithmetic. Ties go to the earlier person.
- Every component column sums to its receipt amount, and every share sums to the receipt total. A property test checks this on 3,000 random receipts.

### Cost and abuse controls

- One vision call per scan, `detail: "high"`. A real scan of the samples used about 2,350 input and 250 to 300 output tokens with `gpt-5.4-mini`, a fraction of a cent per receipt.
- Samples load a saved result from a real scan, so trying the app costs nothing. A "scan it live" link runs the real call.
- Uploads are checked before anything is counted: content-length cap of 4MB, multipart only, magic-byte sniffing for JPEG, PNG and WebP. Only well-formed requests count against the rate limit.
- In-memory rate limit per IP (4 scans per hour by default). The IP comes from `x-real-ip`, then the last `x-forwarded-for` entry, because the leftmost one is set by the client.
- The SDK retries 429 and 5xx twice with backoff and times out after 60 seconds. `store: false` keeps receipts out of OpenAI's stored responses.

## Run it

```bash
npm install
cp .env.example .env.local   # add OPENAI_API_KEY
npm run dev                  # http://localhost:3203
npm test                     # 55 unit tests: money parsing, reconciliation, split maths, share links
npm run lint && npm run build
```

## Config

| Variable | Default | What it does |
| --- | --- | --- |
| `OPENAI_API_KEY` | none | Server-side key for the vision call |
| `OPENAI_MODEL` | `gpt-5.4-mini` | Model used to read receipts |
| `RATE_LIMIT_SCAN` | `4` | Scans allowed per IP per window |
| `RATE_LIMIT_WINDOW_MS` | `3600000` | Rate limit window |

## Project layout

- `lib/money.ts` parsing and formatting in minor units
- `lib/receipt.ts` reconciliation and confidence
- `lib/split.ts` allocation, per-person shares, settle up
- `lib/extraction.ts` the Structured Outputs schema, prompt and normalizer
- `lib/share.ts` URL encoding of a split
- `app/api/scan/route.ts` upload checks, rate limit, vision call
- `public/samples/` three sample receipt photos (rendered from HTML) and their saved scans
