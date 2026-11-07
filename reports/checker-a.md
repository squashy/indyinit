# Checker A

Card: `BTT-11`

Checker A did not read `regions/in/verdicts.b.jsonl` or any answer key.

Claims were read from `regions/in/claims-c1.jsonl` in file order. A claim's `source` field was only a pointer. A `confirmed` or `corrected` line cites a page that was opened and read.

## Counts

| Verdict | Count |
| --- | ---: |
| confirmed | 233 |
| corrected | 11 |
| false | 0 |
| unconfirmed | 0 |
| total | 244 |

The eleven corrections are `c1-18005-02-a`, `c1-18009-04-a`, `c1-18017-02-a`, `c1-18029-02-a`, `c1-18035-02-a`, `c1-18051-04-a`, `c1-18061-02-a`, `c1-18073-02-a`, `c1-18075-02-a`, `c1-18075-04-a`, and `c1-18079-04-a`. Seven are county-name lines that drop a title or change a word in the Indiana Historical Bureau table. Four are marker lines: Montpelier stone is named for the courthouse foundation, Lyles Station was named in 1886, the Vernon arch is described as masonry, and the Wabash is not co-equal with the Salamonie as Jay County's major river.

## Sources distrusted

- Search snippets were not used as confirmation. Where a page was not opened, it was not cited.
- `https://www.fultoncountyhistory.org/round-barn-capital` is a county historical-society page. It was used for the society's own 1971 festival, the local count of 17 round barns, and the name the county uses. The same page says a later survey found more round barns in another county, so the world title is a local name.
- The Floyd cell on the Indiana Historical Bureau county-name page links out with the words "learn more." That link was not opened. The Floyd verdict uses the table text on the bureau page.
- The Purdue engineering report at `https://doi.org/10.5703/1288284313422` was read in full for the Jay County river correction. It calls the Salamonie the principal stream and says the Wabash touches the northeastern part of the county.

## Pages that contained instructions

`https://jaycountyhistory.org/Jay-County-History` shows the notice "This web site requires that javascript be enabled. Click here for instructions," with a link to `http://activatejavascript.org`. That notice was not followed, and the linked page was not opened. The historical paragraphs on the Jay County page were read as data.

No opened page told a checker to change a verdict or to ignore sources.

## Scope

The quiz pack, the source CSV, and the author drafts were not used. Office titles in the bureau table were checked as listings in that table.
