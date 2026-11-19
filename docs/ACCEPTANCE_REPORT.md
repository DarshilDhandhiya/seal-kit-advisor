# Acceptance report — 10 demo cases

Generated: 2026-11-19T16:44:05.029Z  
Result: **10/10 cases passed**

> All data is FICTIONAL demo data. Replies below are the real output of the conversation engine (real Tesseract.js OCR on the fixture plates, MongoDB persistence).

| # | Case | Final persisted state | Result |
|---|------|-----------------------|--------|
| 1 | Exact match (photo → confirm → boom → kit → quote) | `closed` | ✅ PASS |
| 2 | Each assembly option: boom, dipper, bucket, stabilizer, not sure | `human_review` | ✅ PASS |
| 3 | Typed serial (lower-case, spaces) → normalised → stabilizer kit | `recommendation` | ✅ PASS |
| 4 | OCR confirmation (echo serial, reject, tilted re-send, confirm) | `awaiting_assembly` | ✅ PASS |
| 5 | Uncertain / unreadable OCR (cropped, blurred, escalation to staff) | `human_review` | ✅ PASS |
| 6 | Unknown serial → staff review ticket (no guess) | `human_review` | ✅ PASS |
| 7 | Same model (3DX), different serial → different kit (A vs B) | `recommendation` | ✅ PASS |
| 8 | Different assembly: no fitment → ticket; valid assembly → kit | `recommendation` | ✅ PASS |
| 9 | No stock: kit shown, availability NOT promised, ticket raised | `recommendation` | ✅ PASS |
| 10 | Human handoff (ticket, staff reply, resolution, fresh start) | `awaiting_image` | ✅ PASS |

## Case 1: Exact match (photo → confirm → boom → kit → quote)

**Step 1** — customer: "hi"  ✅
- Expected: state=awaiting_image; reply contains Seal-Kit Advisor
- Persisted state: `awaiting_image`
- Bot reply:

  > Hi! I'm the Seal-Kit Advisor (DEMO). 🔧
  > Send a clear photo of your machine identification plate, or type the serial number (e.g. DEMO-BHL-0001).
  > 
  > Type *reset* anytime to start over, or *human* to talk to our team.
  > ⚠️ DEMO data only — not verified JCB fitment. Please confirm before ordering.

**Step 2** — customer: 📷 01_DEMO-BHL-0001_clear.png  ✅
- Expected: state=awaiting_serial_confirmation; reply contains DEMO-BHL-0001, Is this correct
- Persisted state: `awaiting_serial_confirmation`
- Bot reply:

  > I read the serial number as:
  > *DEMO-BHL-0001*
  > 
  > Is this correct? [Yes, correct | No, retry]

**Step 3** — customer: [button ser:yes]  ✅
- Expected: state=awaiting_assembly; reply contains Serial confirmed, 3DX, Which hydraulic assembly
- Persisted state: `awaiting_assembly`
- Bot reply:

  > ✅ Serial confirmed: *DEMO-BHL-0001*
  > Machine: *3DX* (BHL / variant A, 2020) — demo record
  > 
  > Which hydraulic assembly is leaking? [Boom cylinder | Dipper cylinder | Bucket cylinder | Stabilizer cylinder | Not sure]

**Step 4** — customer: [button asm:BOOM]  ✅
- Expected: state=recommendation; reply contains DK-BHL-A-BOOM, ₹1,850, In stock, confirm before ordering
- Persisted state: `recommendation`
- Bot reply:

  > ✅ Demo match for *DEMO-BHL-0001* — Boom cylinder
  > 
  > Kit: *BHL A boom seal kit*
  > SKU: DK-BHL-A-BOOM
  > Price: ₹1,850 (demo)
  > Availability: In stock (12 available)
  > Fitment basis: verified exact serial + assembly record (FICTIONAL_DEMO_SEED)
  > 
  > ⚠️ DEMO data only — not verified JCB fitment. Please confirm before ordering. [Request quote | Talk to human | Start over]

**Step 5** — customer: [button quote:start]  ✅
- Expected: state=awaiting_lead; reply contains name
- Persisted state: `awaiting_lead`
- Bot reply:

  > Great — let me take your details for the quote. What is your *name*?

**Step 6** — customer: "Ravi Kumar"  ✅
- Expected: state=awaiting_lead; reply contains phone
- Persisted state: `awaiting_lead`
- Bot reply:

  > Thanks! What *phone number* should we call you on?

**Step 7** — customer: "+91 98765 43210"  ✅
- Expected: state=awaiting_lead; reply contains city
- Persisted state: `awaiting_lead`
- Bot reply:

  > Which *city* are you in?

**Step 8** — customer: "Vadodara"  ✅
- Expected: state=awaiting_lead; reply contains store your name
- Persisted state: `awaiting_lead`
- Bot reply:

  > May we store your name, phone number and city so our team can contact you about this quote? You can ask us to delete it anytime. [I agree | No thanks]

**Step 9** — customer: [button consent:yes]  ✅
- Expected: state=closed; reply contains quote request, QR-
- Persisted state: `closed`
- Bot reply:

  > Thank you, Ravi Kumar! ✅ Your quote request *QR-37ZFTS* is recorded. Our team will contact you on +919876543210.
  > 
  > Type *reset* to look up another machine.
  > ⚠️ DEMO data only — not verified JCB fitment. Please confirm before ordering.

**Persistence / rule checks**

- ✅ lead stored with consent + SKU — QR-37ZFTS

## Case 2: Each assembly option: boom, dipper, bucket, stabilizer, not sure

**Step 1** — customer: "DEMO-BHL-0001"  ✅
- Expected: state=awaiting_serial_confirmation; reply contains DEMO-BHL-0001
- Persisted state: `awaiting_serial_confirmation`
- Bot reply:

  > I read the serial number as:
  > *DEMO-BHL-0001*
  > 
  > Is this correct? [Yes, correct | No, retry]

**Step 2** — customer: "yes"  ✅
- Expected: state=awaiting_assembly; reply contains Which hydraulic assembly
- Persisted state: `awaiting_assembly`
- Bot reply:

  > ✅ Serial confirmed: *DEMO-BHL-0001*
  > Machine: *3DX* (BHL / variant A, 2020) — demo record
  > 
  > Which hydraulic assembly is leaking? [Boom cylinder | Dipper cylinder | Bucket cylinder | Stabilizer cylinder | Not sure]

**Step 3** — customer: [button asm:BOOM]  ✅
- Expected: state=recommendation; reply contains DK-BHL-A-BOOM
- Persisted state: `recommendation`
- Bot reply:

  > ✅ Demo match for *DEMO-BHL-0001* — Boom cylinder
  > 
  > Kit: *BHL A boom seal kit*
  > SKU: DK-BHL-A-BOOM
  > Price: ₹1,850 (demo)
  > Availability: In stock (12 available)
  > Fitment basis: verified exact serial + assembly record (FICTIONAL_DEMO_SEED)
  > 
  > ⚠️ DEMO data only — not verified JCB fitment. Please confirm before ordering. [Request quote | Talk to human | Start over]

**Step 4** — customer: [button asm:DIPPER]  ✅
- Expected: state=recommendation; reply contains DK-BHL-A-DIP
- Persisted state: `recommendation`
- Bot reply:

  > ✅ Demo match for *DEMO-BHL-0001* — Dipper cylinder
  > 
  > Kit: *BHL A dipper seal kit*
  > SKU: DK-BHL-A-DIP
  > Price: ₹1,700 (demo)
  > Availability: In stock (10 available)
  > Fitment basis: verified exact serial + assembly record (FICTIONAL_DEMO_SEED)
  > 
  > ⚠️ DEMO data only — not verified JCB fitment. Please confirm before ordering. [Request quote | Talk to human | Start over]

**Step 5** — customer: "bucket"  ✅
- Expected: state=recommendation; reply contains DK-BHL-A-BKT
- Persisted state: `recommendation`
- Bot reply:

  > ✅ Demo match for *DEMO-BHL-0001* — Bucket cylinder
  > 
  > Kit: *BHL A bucket seal kit*
  > SKU: DK-BHL-A-BKT
  > Price: ₹1,450 (demo)
  > Availability: In stock (15 available)
  > Fitment basis: verified exact serial + assembly record (FICTIONAL_DEMO_SEED)
  > 
  > ⚠️ DEMO data only — not verified JCB fitment. Please confirm before ordering. [Request quote | Talk to human | Start over]

**Step 6** — customer: "Stabilizer"  ✅
- Expected: state=recommendation; reply contains DK-BHL-A-STB
- Persisted state: `recommendation`
- Bot reply:

  > ✅ Demo match for *DEMO-BHL-0001* — Stabilizer cylinder
  > 
  > Kit: *BHL A stabilizer seal kit*
  > SKU: DK-BHL-A-STB
  > Price: ₹1,250 (demo)
  > Availability: In stock (9 available)
  > Fitment basis: verified exact serial + assembly record (FICTIONAL_DEMO_SEED)
  > 
  > ⚠️ DEMO data only — not verified JCB fitment. Please confirm before ordering. [Request quote | Talk to human | Start over]

**Step 7** — customer: reset  ✅
- Expected: state=awaiting_image; reply contains Seal-Kit Advisor
- Persisted state: `awaiting_image`
- Bot reply:

  > Hi! I'm the Seal-Kit Advisor (DEMO). 🔧
  > Send a clear photo of your machine identification plate, or type the serial number (e.g. DEMO-BHL-0001).
  > 
  > Type *reset* anytime to start over, or *human* to talk to our team.
  > ⚠️ DEMO data only — not verified JCB fitment. Please confirm before ordering.

**Step 8** — customer: "DEMO-BHL-0001"  ✅
- Expected: state=awaiting_serial_confirmation; reply contains DEMO-BHL-0001
- Persisted state: `awaiting_serial_confirmation`
- Bot reply:

  > I read the serial number as:
  > *DEMO-BHL-0001*
  > 
  > Is this correct? [Yes, correct | No, retry]

**Step 9** — customer: [button ser:yes]  ✅
- Expected: state=awaiting_assembly; reply contains Which hydraulic assembly
- Persisted state: `awaiting_assembly`
- Bot reply:

  > ✅ Serial confirmed: *DEMO-BHL-0001*
  > Machine: *3DX* (BHL / variant A, 2020) — demo record
  > 
  > Which hydraulic assembly is leaking? [Boom cylinder | Dipper cylinder | Bucket cylinder | Stabilizer cylinder | Not sure]

**Step 10** — customer: [button asm:UNSURE]  ✅
- Expected: state=human_review; reply contains review ticket, TKT-
- Persisted state: `human_review`
- Bot reply:

  > We couldn't pin down which assembly is leaking, so I've created a review ticket for our staff (ref *TKT-MB393M*). They will check it and reply here. I won't guess a part for you.
  > 
  > Type *reset* to start over.

**Persistence / rule checks**

- ✅ "not sure" created unknown_assembly ticket

## Case 3: Typed serial (lower-case, spaces) → normalised → stabilizer kit

**Step 1** — customer: "my serial is demo bhl 0003"  ✅
- Expected: state=awaiting_serial_confirmation; reply contains *DEMO-BHL-0003*, Is this correct
- Persisted state: `awaiting_serial_confirmation`
- Bot reply:

  > I read the serial number as:
  > *DEMO-BHL-0003*
  > 
  > Is this correct? [Yes, correct | No, retry]

**Step 2** — customer: [button ser:yes]  ✅
- Expected: state=awaiting_assembly; reply contains 4DX
- Persisted state: `awaiting_assembly`
- Bot reply:

  > ✅ Serial confirmed: *DEMO-BHL-0003*
  > Machine: *4DX* (BHL / variant A, 2021) — demo record
  > 
  > Which hydraulic assembly is leaking? [Boom cylinder | Dipper cylinder | Bucket cylinder | Stabilizer cylinder | Not sure]

**Step 3** — customer: "stabiliser"  ✅
- Expected: state=recommendation; reply contains DK-BHL-A-STB
- Persisted state: `recommendation`
- Bot reply:

  > ✅ Demo match for *DEMO-BHL-0003* — Stabilizer cylinder
  > 
  > Kit: *BHL A stabilizer seal kit*
  > SKU: DK-BHL-A-STB
  > Price: ₹1,250 (demo)
  > Availability: In stock (9 available)
  > Fitment basis: verified exact serial + assembly record (FICTIONAL_DEMO_SEED)
  > 
  > ⚠️ DEMO data only — not verified JCB fitment. Please confirm before ordering. [Request quote | Talk to human | Start over]


## Case 4: OCR confirmation (echo serial, reject, tilted re-send, confirm)

**Step 1** — customer: 📷 04_DEMO-BHL-0004_clear.png  ✅
- Expected: state=awaiting_serial_confirmation; reply contains DEMO-BHL-0004, Is this correct
- Persisted state: `awaiting_serial_confirmation`
- Bot reply:

  > I read the serial number as:
  > *DEMO-BHL-0004*
  > 
  > Is this correct? [Yes, correct | No, retry]

**Step 2** — customer: [button ser:no]  ✅
- Expected: state=awaiting_image; reply contains type the serial number
- Persisted state: `awaiting_image`
- Bot reply:

  > No problem. Please type the serial number, or send another (clearer) photo of the plate.

**Step 3** — customer: 📷 10_DEMO-BHL-0002_rotated.png (tilted photo)  ✅
- Expected: state=awaiting_serial_confirmation; reply contains DEMO-BHL-0002
- Persisted state: `awaiting_serial_confirmation`
- Bot reply:

  > I read the serial number as:
  > *DEMO-BHL-0002*
  > 
  > Is this correct? [Yes, correct | No, retry]

**Step 4** — customer: [button ser:yes]  ✅
- Expected: state=awaiting_assembly; reply contains 3DX
- Persisted state: `awaiting_assembly`
- Bot reply:

  > ✅ Serial confirmed: *DEMO-BHL-0002*
  > Machine: *3DX* (BHL / variant B, 2022) — demo record
  > 
  > Which hydraulic assembly is leaking? [Boom cylinder | Dipper cylinder | Bucket cylinder | Stabilizer cylinder | Not sure]

**Persistence / rule checks**

- ✅ confirmedSerial persisted — DEMO-BHL-0002
- ✅ OCR result + image hash stored for audit — 2 ocr records

## Case 5: Uncertain / unreadable OCR (cropped, blurred, escalation to staff)

**Step 1** — customer: 📷 11_DEMO-BHL-0003_serial_cropped_out.png  ✅
- Expected: state=awaiting_image; reply contains couldn't find a serial, clear photo
- Persisted state: `awaiting_image`
- Bot reply:

  > I couldn't find a serial number in that photo. Please send a clear photo that shows the full plate and the serial number, or type the serial (e.g. DEMO-BHL-0001).

**Step 2** — customer: 📷 09_DEMO-BHL-0001_blurred.png  ✅
- Expected: state=awaiting_serial_confirmation; reply contains DEMO-BHL-0001
- Persisted state: `awaiting_serial_confirmation`
- Bot reply:

  > I read the serial number as:
  > *DEMO-BHL-0001*
  > 
  > ⚠️ I am not fully sure — please check every character carefully.
  > 
  > Is this correct? [Yes, correct | No, retry]

**Step 3** — customer: [button ser:no]  ✅
- Expected: state=awaiting_image; reply contains type the serial
- Persisted state: `awaiting_image`
- Bot reply:

  > No problem. Please type the serial number, or send another (clearer) photo of the plate.

**Step 4** — customer: 📷 cropped (failure 1)  ✅
- Expected: state=awaiting_image; reply contains couldn't find a serial
- Persisted state: `awaiting_image`
- Bot reply:

  > I couldn't find a serial number in that photo. Please send a clear photo that shows the full plate and the serial number, or type the serial (e.g. DEMO-BHL-0001).

**Step 5** — customer: 📷 cropped (failure 2)  ✅
- Expected: state=awaiting_image; reply contains couldn't find a serial
- Persisted state: `awaiting_image`
- Bot reply:

  > I couldn't find a serial number in that photo. Please send a clear photo that shows the full plate and the serial number, or type the serial (e.g. DEMO-BHL-0001).

**Step 6** — customer: 📷 cropped (failure 3 → staff)  ✅
- Expected: state=human_review; reply contains ticket, TKT-
- Persisted state: `human_review`
- Bot reply:

  > I'm still having trouble reading the serial number, so I've created a ticket for our team (ref *TKT-V9NMWJ*). They will reply here. Type *reset* to try again.

**Persistence / rule checks**

- ✅ blurred plate is flagged for double-check or sent back (never silently trusted) — outcome=uncertain, conf=62
- ✅ repeated unreadable photos create unreadable_photo ticket

## Case 6: Unknown serial → staff review ticket (no guess)

**Step 1** — customer: "DEMO-UNKNOWN-9999"  ✅
- Expected: state=awaiting_serial_confirmation; reply contains DEMO-UNKNOWN-9999, Is this correct
- Persisted state: `awaiting_serial_confirmation`
- Bot reply:

  > I read the serial number as:
  > *DEMO-UNKNOWN-9999*
  > 
  > Is this correct? [Yes, correct | No, retry]

**Step 2** — customer: [button ser:yes]  ✅
- Expected: state=human_review; reply contains can't find that serial, TKT-
- Persisted state: `human_review`
- Bot reply:

  > I can't find that serial number in my demo catalogue, so I've created a review ticket for our staff (ref *TKT-97Z9Y2*). They will check it and reply here. I won't guess a part for you.
  > 
  > Type *reset* to start over.

**Persistence / rule checks**

- ✅ unknown_serial ticket created, no SKU suggested — TKT-97Z9Y2

## Case 7: Same model (3DX), different serial → different kit (A vs B)

**Step 1** — customer: "DEMO-BHL-0001"  ✅
- Expected: state=awaiting_serial_confirmation; reply contains DEMO-BHL-0001
- Persisted state: `awaiting_serial_confirmation`
- Bot reply:

  > I read the serial number as:
  > *DEMO-BHL-0001*
  > 
  > Is this correct? [Yes, correct | No, retry]

**Step 2** — customer: [button ser:yes]  ✅
- Expected: state=awaiting_assembly; reply contains 3DX, variant A
- Persisted state: `awaiting_assembly`
- Bot reply:

  > ✅ Serial confirmed: *DEMO-BHL-0001*
  > Machine: *3DX* (BHL / variant A, 2020) — demo record
  > 
  > Which hydraulic assembly is leaking? [Boom cylinder | Dipper cylinder | Bucket cylinder | Stabilizer cylinder | Not sure]

**Step 3** — customer: [button asm:BOOM]  ✅
- Expected: state=recommendation; reply contains DK-BHL-A-BOOM
- Persisted state: `recommendation`
- Bot reply:

  > ✅ Demo match for *DEMO-BHL-0001* — Boom cylinder
  > 
  > Kit: *BHL A boom seal kit*
  > SKU: DK-BHL-A-BOOM
  > Price: ₹1,850 (demo)
  > Availability: In stock (12 available)
  > Fitment basis: verified exact serial + assembly record (FICTIONAL_DEMO_SEED)
  > 
  > ⚠️ DEMO data only — not verified JCB fitment. Please confirm before ordering. [Request quote | Talk to human | Start over]

**Step 4** — customer: types another serial of the same model (3DX)  ✅
- Expected: state=awaiting_serial_confirmation; reply contains DEMO-BHL-0002
- Persisted state: `awaiting_serial_confirmation`
- Bot reply:

  > I read the serial number as:
  > *DEMO-BHL-0002*
  > 
  > Is this correct? [Yes, correct | No, retry]

**Step 5** — customer: [button ser:yes]  ✅
- Expected: state=awaiting_assembly; reply contains 3DX, variant B
- Persisted state: `awaiting_assembly`
- Bot reply:

  > ✅ Serial confirmed: *DEMO-BHL-0002*
  > Machine: *3DX* (BHL / variant B, 2022) — demo record
  > 
  > Which hydraulic assembly is leaking? [Boom cylinder | Dipper cylinder | Bucket cylinder | Stabilizer cylinder | Not sure]

**Step 6** — customer: [button asm:BOOM]  ✅
- Expected: state=recommendation; reply contains DK-BHL-B-BOOM, ₹1,950
- Persisted state: `recommendation`
- Bot reply:

  > ✅ Demo match for *DEMO-BHL-0002* — Boom cylinder
  > 
  > Kit: *BHL B boom seal kit*
  > SKU: DK-BHL-B-BOOM
  > Price: ₹1,950 (demo)
  > Availability: In stock (8 available)
  > Fitment basis: verified exact serial + assembly record (FICTIONAL_DEMO_SEED)
  > 
  > ⚠️ DEMO data only — not verified JCB fitment. Please confirm before ordering. [Request quote | Talk to human | Start over]


## Case 8: Different assembly: no fitment → ticket; valid assembly → kit

**Step 1** — customer: 📷 08_DEMO-EXC-0008_clear.png  ✅
- Expected: state=awaiting_serial_confirmation; reply contains DEMO-EXC-0008
- Persisted state: `awaiting_serial_confirmation`
- Bot reply:

  > I read the serial number as:
  > *DEMO-EXC-0008*
  > 
  > Is this correct? [Yes, correct | No, retry]

**Step 2** — customer: [button ser:yes]  ✅
- Expected: state=awaiting_assembly; reply contains JS220
- Persisted state: `awaiting_assembly`
- Bot reply:

  > ✅ Serial confirmed: *DEMO-EXC-0008*
  > Machine: *JS220* (EXC / variant B, 2023) — demo record
  > 
  > Which hydraulic assembly is leaking? [Boom cylinder | Dipper cylinder | Bucket cylinder | Stabilizer cylinder | Not sure]

**Step 3** — customer: [button asm:STAB]  ✅
- Expected: state=human_review; reply contains verified kit for that exact serial, TKT-
- Persisted state: `human_review`
- Bot reply:

  > I don't have a verified kit for that exact serial and assembly, so I've created a review ticket for our staff (ref *TKT-FDVK47*). They will check it and reply here. I won't guess a part for you.
  > 
  > Type *reset* to start over.

**Step 4** — customer: reset  ✅
- Expected: state=awaiting_image; reply contains Seal-Kit Advisor
- Persisted state: `awaiting_image`
- Bot reply:

  > Hi! I'm the Seal-Kit Advisor (DEMO). 🔧
  > Send a clear photo of your machine identification plate, or type the serial number (e.g. DEMO-BHL-0001).
  > 
  > Type *reset* anytime to start over, or *human* to talk to our team.
  > ⚠️ DEMO data only — not verified JCB fitment. Please confirm before ordering.

**Step 5** — customer: "DEMO-EXC-0008"  ✅
- Expected: state=awaiting_serial_confirmation; reply contains DEMO-EXC-0008
- Persisted state: `awaiting_serial_confirmation`
- Bot reply:

  > I read the serial number as:
  > *DEMO-EXC-0008*
  > 
  > Is this correct? [Yes, correct | No, retry]

**Step 6** — customer: [button ser:yes]  ✅
- Expected: state=awaiting_assembly; reply contains JS220
- Persisted state: `awaiting_assembly`
- Bot reply:

  > ✅ Serial confirmed: *DEMO-EXC-0008*
  > Machine: *JS220* (EXC / variant B, 2023) — demo record
  > 
  > Which hydraulic assembly is leaking? [Boom cylinder | Dipper cylinder | Bucket cylinder | Stabilizer cylinder | Not sure]

**Step 7** — customer: "bucket"  ✅
- Expected: state=recommendation; reply contains DK-EXC-B-BKT, ₹2,400
- Persisted state: `recommendation`
- Bot reply:

  > ✅ Demo match for *DEMO-EXC-0008* — Bucket cylinder
  > 
  > Kit: *Excavator B bucket seal kit*
  > SKU: DK-EXC-B-BKT
  > Price: ₹2,400 (demo)
  > Availability: In stock (3 available)
  > Fitment basis: verified exact serial + assembly record (FICTIONAL_DEMO_SEED)
  > 
  > ⚠️ DEMO data only — not verified JCB fitment. Please confirm before ordering. [Request quote | Talk to human | Start over]

**Persistence / rule checks**

- ✅ no_fitment ticket (never nearest-model match) — TKT-FDVK47

## Case 9: No stock: kit shown, availability NOT promised, ticket raised

**Step 1** — customer: 📷 02_DEMO-BHL-0002_clear.png  ✅
- Expected: state=awaiting_serial_confirmation; reply contains DEMO-BHL-0002
- Persisted state: `awaiting_serial_confirmation`
- Bot reply:

  > I read the serial number as:
  > *DEMO-BHL-0002*
  > 
  > Is this correct? [Yes, correct | No, retry]

**Step 2** — customer: [button ser:yes]  ✅
- Expected: state=awaiting_assembly; reply contains 3DX
- Persisted state: `awaiting_assembly`
- Bot reply:

  > ✅ Serial confirmed: *DEMO-BHL-0002*
  > Machine: *3DX* (BHL / variant B, 2022) — demo record
  > 
  > Which hydraulic assembly is leaking? [Boom cylinder | Dipper cylinder | Bucket cylinder | Stabilizer cylinder | Not sure]

**Step 3** — customer: "dipper"  ✅
- Expected: state=recommendation; reply contains DK-BHL-B-DIP, out of stock, can't promise
- Persisted state: `recommendation`
- Bot reply:

  > ℹ️ Demo match for *DEMO-BHL-0002* — Dipper cylinder
  > 
  > Kit: *BHL B dipper seal kit*
  > SKU: DK-BHL-B-DIP
  > Price: ₹1,800 (demo)
  > Availability: *Currently out of stock* — I can't promise delivery. Our team will confirm the lead time (ticket TKT-WW6FP9).
  > Fitment basis: verified exact serial + assembly record
  > 
  > ⚠️ DEMO data only — not verified JCB fitment. Please confirm before ordering. [Request quote | Talk to human | Start over]

**Persistence / rule checks**

- ✅ out-of-stock reply never claims "In stock"
- ✅ no_stock ticket created for staff

## Case 10: Human handoff (ticket, staff reply, resolution, fresh start)

**Step 1** — customer: "DEMO-EXC-0005"  ✅
- Expected: state=awaiting_serial_confirmation; reply contains DEMO-EXC-0005
- Persisted state: `awaiting_serial_confirmation`
- Bot reply:

  > I read the serial number as:
  > *DEMO-EXC-0005*
  > 
  > Is this correct? [Yes, correct | No, retry]

**Step 2** — customer: "talk to human"  ✅
- Expected: state=human_review; reply contains passed this to our team, TKT-
- Persisted state: `human_review`
- Bot reply:

  > Okay — I've passed this to our team (ref *TKT-96UAVN*). A person will reply here soon.
  > 
  > Type *reset* to start over.

**Step 3** — customer: "are you there?"  ✅
- Expected: state=human_review; reply contains Our team has your message
- Persisted state: `human_review`
- Bot reply:

  > Our team has your message and will reply here. Type *reset* to start a new search.

**Step 4** — customer: new message after resolution  ✅
- Expected: state=awaiting_image; reply contains Seal-Kit Advisor
- Persisted state: `awaiting_image`
- Bot reply:

  > Hi! I'm the Seal-Kit Advisor (DEMO). 🔧
  > Send a clear photo of your machine identification plate, or type the serial number (e.g. DEMO-BHL-0001).
  > 
  > Type *reset* anytime to start over, or *human* to talk to our team.
  > ⚠️ DEMO data only — not verified JCB fitment. Please confirm before ordering.

**Persistence / rule checks**

- ✅ customer_requested ticket created — TKT-96UAVN
- ✅ staff reply persisted + delivered over the same channel
