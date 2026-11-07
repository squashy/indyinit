# States

Survey numbers are measured from `us-atlas 3.0.1 counties-10m`: 51 jurisdictions and 3,142 territories.

## The seven contest states

| State | Territories | Unit | What it tests | Crossings |
|---|---|---|---|---|
| Indiana | 92 | County | Pilot | None |
| Ohio | 88 | County | Hidden Indiana assumptions | None |
| Louisiana | 64 | Parish | Hard-coded "county" | None |
| Wyoming | 23 | County | Game-length fallback | None |
| Michigan | 83 | County | Cut-off Upper Peninsula | Mackinac Bridge |
| Virginia | 133 | County or independent city | No seats, repeated names, cut-off Eastern Shore | Chesapeake Bay Bridge-Tunnel |
| Texas | 254 | County | Size, phone legibility | None |

## Crossings

Counties separated by water share no border in the map data. Each crossing below is a real link with a stated reason.

| State | Connects | Crossing | Basis |
|---|---|---|---|
| Michigan | Mackinac to Emmet, joining the 15 Upper Peninsula counties | Mackinac Bridge, St. Ignace to Mackinaw City | [Mackinac Bridge Authority](https://www.mackinacbridge.org/?p=638) for the cities. Emmet as the south-end county is confirmed against a source in the Michigan ticket |
| Virginia | Northampton to Virginia Beach, joining Northampton and Accomack | Chesapeake Bay Bridge-Tunnel | [Virginia Places](https://virginiaplaces.org/transportation/cbbtnorthampton.html) |

## Known traps in the contest states

- **Virginia:** Fairfax, Franklin, Richmond and Roanoke each appear twice, as a county and an independent city. Everything is referenced by FIPS, and display names must tell them apart. Independent cities go in `noSeat`.
- **Louisiana:** All wording comes from `unit` in the manifest.
- **Texas:** 254 army badges have not yet been seen on a phone. Zoom is required.
- **Wyoming:** A 4-player Total game ran a median of 44 rounds in practice, over the limit of 35, on only 8 games. It is expected to need more regions or the Quick-only fallback.
- **Data vintage:** The map data may not match the latest county changes, so the map gate checks counties against the bank's list.

## Out of scope today

District of Columbia (1), Delaware (3), Hawaii (5), Rhode Island (5), Connecticut (8), New Hampshire (10). These have too few counties for the game to work, and they would need finer map units and matching questions. Listed as not done, for this reason.

## Bonus states with cut-off counties

These need a sourced crossing before they ship, and a state ticket adds one to this file first. The likely crossings below come from general knowledge and have not been checked.

| State | Cut off | Likely crossing |
|---|---|---|
| New York | Richmond (Staten Island) | Verrazzano-Narrows Bridge to Kings |
| Massachusetts | Nantucket | Ferry to Barnstable |
| Washington | San Juan | Ferry to Skagit |
| Alaska | Aleutians West | Aleutians East; the far-spread shape also needs checking on screen |

## Simulation across sizes

Practice results, with armies scaled to map size and machine-drawn regions over 8 games per setup, so these are indications. Indiana used hand-drawn regions and 25 games.

| State | Territories | 4-player Total, median rounds | 4-player Quick, median rounds | Within bars? |
|---|---|---|---|---|
| Nevada | 17 | 21 | 21 | Yes |
| Wyoming | 23 | 44 | 22 | No: Total over 35 |
| Ohio | 88 | 23 | 16 | Yes |
| Indiana | 92 | 22 | 16 | Yes |
| Georgia | 159 | 21 | 15 | Yes |
| Texas | 254 | 29 | 18 | Yes |

## All jurisdictions

| State | Abbr | Territories | Connected groups | Group |
|---|---|---|---|---|
| Alabama | AL | 67 | 1 | Bonus |
| Alaska | AK | 29 | 2 | Bonus, needs crossing |
| Arizona | AZ | 15 | 1 | Bonus |
| Arkansas | AR | 75 | 1 | Bonus |
| California | CA | 58 | 1 | Bonus |
| Colorado | CO | 64 | 1 | Bonus |
| Connecticut | CT | 8 | 1 | Out of scope |
| Delaware | DE | 3 | 1 | Out of scope |
| District of Columbia | DC | 1 | 1 | Out of scope |
| Florida | FL | 67 | 1 | Bonus |
| Georgia | GA | 159 | 1 | Bonus |
| Hawaii | HI | 5 | 4 | Out of scope |
| Idaho | ID | 44 | 1 | Bonus |
| Illinois | IL | 102 | 1 | Bonus |
| Indiana | IN | 92 | 1 | Contest |
| Iowa | IA | 99 | 1 | Bonus |
| Kansas | KS | 105 | 1 | Bonus |
| Kentucky | KY | 120 | 1 | Bonus |
| Louisiana | LA | 64 | 1 | Contest |
| Maine | ME | 16 | 1 | Bonus |
| Maryland | MD | 24 | 1 | Bonus |
| Massachusetts | MA | 14 | 2 | Bonus, needs crossing |
| Michigan | MI | 83 | 2 | Contest |
| Minnesota | MN | 87 | 1 | Bonus |
| Mississippi | MS | 82 | 1 | Bonus |
| Missouri | MO | 115 | 1 | Bonus |
| Montana | MT | 56 | 1 | Bonus |
| Nebraska | NE | 93 | 1 | Bonus |
| Nevada | NV | 17 | 1 | Bonus |
| New Hampshire | NH | 10 | 1 | Out of scope |
| New Jersey | NJ | 21 | 1 | Bonus |
| New Mexico | NM | 33 | 1 | Bonus |
| New York | NY | 62 | 2 | Bonus, needs crossing |
| North Carolina | NC | 100 | 1 | Bonus |
| North Dakota | ND | 53 | 1 | Bonus |
| Ohio | OH | 88 | 1 | Contest |
| Oklahoma | OK | 77 | 1 | Bonus |
| Oregon | OR | 36 | 1 | Bonus |
| Pennsylvania | PA | 67 | 1 | Bonus |
| Rhode Island | RI | 5 | 2 | Out of scope |
| South Carolina | SC | 46 | 1 | Bonus |
| South Dakota | SD | 66 | 1 | Bonus |
| Tennessee | TN | 95 | 1 | Bonus |
| Texas | TX | 254 | 1 | Contest |
| Utah | UT | 29 | 1 | Bonus |
| Vermont | VT | 14 | 1 | Bonus |
| Virginia | VA | 133 | 2 | Contest |
| Washington | WA | 39 | 2 | Bonus, needs crossing |
| West Virginia | WV | 55 | 1 | Bonus |
| Wisconsin | WI | 72 | 1 | Bonus |
| Wyoming | WY | 23 | 1 | Contest |
