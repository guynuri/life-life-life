-- Mood v2 (SPEC 4): one emotion and an optional note per day replace the six pastel colors.
-- The old color rows are deleted on purpose; the owner agreed the data can go.

delete from public.moods;

alter table public.moods drop column color;

alter table public.moods
  add column emotion text not null check (emotion in ('happy', 'excited', 'proud', 'calm', 'tired', 'anxious', 'annoyed', 'sad')),
  add column note text check (char_length(note) <= 500);

-- Grants from 0005 cover the table; the new columns inherit them.
