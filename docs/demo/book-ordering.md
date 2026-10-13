# Book ordering and volume numbers

Apply `supabase/migrations/V026__book_volume_number.sql` in the Supabase SQL
editor before using volume numbers or the updated MCP book tools.

- In Books, use the up/down arrows to change a book's position. Changes persist
  using the existing rank field; the first/last moves are disabled at the edges.
- In a book's details, set **Volume number (optional)**. It saves on blur; clear
  it to remove the number. Only positive integers are accepted.
- Books displays the series, volume number, and list position. Numbering is
  independent of list order, so companion books can be placed freely.
- Existing books retain their order and have no volume number until specified.
- MCP `create_book` accepts `volume_number`; `update_book` accepts
  `volume_number` (including null) and `rank`. `list_books` returns both, along
  with `series_title`. Rank remains a fractional base-62 string.

Verify with three books: move the last to the start, reload, set volume numbers
in the detail screens, reload, and confirm order and numbering persist. Clear
one number and verify the other metadata remains intact. Volume numbers are
currently displayed in Books and book details; PDF layout is unchanged.
