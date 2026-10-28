/**
 * Skill chips with autocomplete.
 * Type to search the skills table; Enter adds the highlighted suggestion (or the typed text
 * if nothing matches); Backspace on an empty box removes the last chip.
 */
import clsx from "clsx";
import { Plus, X } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";

import { api } from "../lib/api";
import type { SkillOption } from "../lib/types";

interface Props {
  value: string[];
  onChange: (skills: string[]) => void;
  max?: number;
  invalid?: boolean;
}

export function SkillInput({ value, onChange, max = 40, invalid }: Props) {
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<SkillOption[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Debounced search: wait 150 ms after the user stops typing.
  useEffect(() => {
    const term = query.trim();
    if (!term) {
      setOptions([]);
      return;
    }
    const id = setTimeout(() => {
      api<SkillOption[]>("/skills", { query: { q: term, limit: 8 } })
        .then((res) => {
          const chosen = new Set(value.map((s) => s.toLowerCase()));
          setOptions(res.filter((o) => !chosen.has(o.name.toLowerCase())));
          setActive(0);
        })
        .catch(() => setOptions([]));
    }, 150);
    return () => clearTimeout(id);
  }, [query, value]);

  function add(skill: string) {
    const s = skill.trim().replace(/\s+/g, " ");
    if (!s || s.length > 60 || value.length >= max) return;
    if (value.some((v) => v.toLowerCase() === s.toLowerCase())) return;
    onChange([...value, s]);
    setQuery("");
    setOptions([]);
    inputRef.current?.focus();
  }

  function remove(skill: string) {
    onChange(value.filter((v) => v !== skill));
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, options.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add(options[active]?.name ?? query);
    } else if (e.key === "Backspace" && !query && value.length) {
      remove(value[value.length - 1]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const showMenu = open && query.trim().length > 0;
  const exactExists = options.some((o) => o.name.toLowerCase() === query.trim().toLowerCase());

  return (
    <div className="relative">
      <div
        className={clsx(
          "flex min-h-11 flex-wrap items-center gap-1.5 rounded-lg border bg-white px-2 py-1.5 shadow-sm focus-within:ring-2 focus-within:ring-brand-500/30",
          invalid ? "border-red-400" : "border-slate-300 focus-within:border-brand-500",
        )}
        onClick={() => inputRef.current?.focus()}
      >
        {value.map((skill) => (
          <span key={skill} className="inline-flex items-center gap-1 rounded-md bg-brand-50 py-1 pl-2 pr-1 text-sm font-medium text-brand-700">
            {skill}
            <button type="button" onClick={() => remove(skill)} className="rounded p-0.5 hover:bg-brand-100" aria-label={`Remove ${skill}`}>
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={onKeyDown}
          placeholder={value.length ? "Add another skill…" : "e.g. React, Logo Design, SEO…"}
          className="min-w-[10rem] flex-1 border-0 bg-transparent px-1 py-1 text-sm outline-none placeholder:text-slate-400"
          aria-label="Add a skill"
          aria-autocomplete="list"
          disabled={value.length >= max}
        />
      </div>

      {showMenu && (
        <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg" role="listbox">
          {options.map((o, i) => (
            <li key={o.name} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => add(o.name)}
                onMouseEnter={() => setActive(i)}
                className={clsx("flex w-full items-center justify-between px-3 py-2 text-left text-sm", i === active ? "bg-brand-50 text-brand-700" : "text-slate-700")}
              >
                <span>{o.name}</span>
                <span className="text-xs text-slate-400">{o.category}</span>
              </button>
            </li>
          ))}
          {!exactExists && (
            <li>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => add(query)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-600 hover:bg-slate-50"
              >
                <Plus className="h-3.5 w-3.5" /> Add “{query.trim()}”
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
