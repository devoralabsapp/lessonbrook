"use client";

import {
  Fragment,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, LoaderCircle } from "lucide-react";
import { normalizeSearch } from "@/domain/list-filters";
import { cn } from "@/lib/utils";

type Option<Value extends string> = {
  value: Value;
  label: string;
  group?: string;
  lang?: string;
};

function revealOption(menu: HTMLElement, option: HTMLElement | null) {
  if (!option) return;
  const item = option.getBoundingClientRect();
  const top = menu.getBoundingClientRect().top + menu.clientTop;
  const bottom = top + menu.clientHeight;
  if (item.top < top) menu.scrollTop += item.top - top;
  if (item.bottom > bottom) menu.scrollTop += item.bottom - bottom;
}

function positionMenu(
  trigger: HTMLElement,
  menu: HTMLElement,
  root: HTMLElement,
) {
  const gap = 8;
  const anchor = trigger.getBoundingClientRect();
  const viewport = window.visualViewport;
  const left = viewport?.offsetLeft ?? 0;
  const top = viewport?.offsetTop ?? 0;
  const right =
    left + (viewport?.width ?? document.documentElement.clientWidth);
  const bottom =
    top + (viewport?.height ?? document.documentElement.clientHeight);
  const dialog =
    root instanceof HTMLDialogElement ? root.getBoundingClientRect() : null;
  if (
    anchor.bottom <= Math.max(top, dialog?.top ?? top) ||
    anchor.top >= Math.min(bottom, dialog?.bottom ?? bottom)
  )
    return false;

  const width = Math.min(Math.max(anchor.width, 184), right - left - 2 * gap);
  const start = trigger.hasAttribute("data-toolbar")
    ? anchor.right - width
    : anchor.left;
  menu.style.width = `${width}px`;
  menu.style.left = `${Math.min(Math.max(start, left + gap), right - gap - width)}px`;
  const below = bottom - anchor.bottom - 2 * gap;
  const above = anchor.top - top - 2 * gap;
  const maxHeight = 352;
  const opensUp =
    below < Math.min(menu.scrollHeight, maxHeight) && above > below;
  menu.style.maxHeight = `${Math.max(0, Math.min(maxHeight, opensUp ? above : below))}px`;
  menu.style.top = `${opensUp ? anchor.top - gap - menu.offsetHeight : anchor.bottom + gap}px`;
  return true;
}

export function ThemedSelect<Value extends string>({
  label,
  value,
  options,
  onChange,
  required = false,
  disabled = false,
  busy = false,
  className,
  field = false,
  toolbar = false,
  compact = false,
  icon,
  describedBy,
}: {
  label: string;
  value: Value;
  options: readonly Option<Value>[];
  onChange: (value: Value) => void;
  required?: boolean;
  disabled?: boolean;
  busy?: boolean;
  className?: string;
  field?: boolean;
  toolbar?: boolean;
  compact?: boolean;
  icon?: ReactNode;
  describedBy?: string;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const listbox = useRef<HTMLDivElement>(null);
  const search = useRef({ text: "", time: 0 });
  const [root, setRoot] = useState<HTMLElement | null>(null);
  const [activeValue, setActiveValue] = useState<Value>(value);
  const [invalid, setInvalid] = useState(false);
  const selected = options.find((option) => option.value === value);
  const active =
    options.find((option) => option.value === activeValue) ??
    selected ??
    options[0];
  const optionId = (option: Option<Value>) =>
    `${id}-${encodeURIComponent(option.value)}`;
  const groups = new Map<string | undefined, Option<Value>[]>();
  if (root) {
    for (const option of options) {
      const group = groups.get(option.group);
      if (group) group.push(option);
      else groups.set(option.group, [option]);
    }
  }

  useLayoutEffect(() => {
    const anchor = trigger.current;
    const menu = listbox.current;
    if (!root || !anchor || !menu) return;
    function dismiss(event: PointerEvent) {
      if (
        event.target instanceof Node &&
        !anchor?.contains(event.target) &&
        !menu?.contains(event.target)
      )
        setRoot(null);
    }
    function position(event?: Event) {
      if (event?.target === menu || !anchor || !menu || !root) return;
      if (anchor.matches(":disabled") || !positionMenu(anchor, menu, root))
        setRoot(null);
    }
    position();
    revealOption(menu, menu.querySelector("[data-active]"));
    const viewport = window.visualViewport;
    document.addEventListener("pointerdown", dismiss);
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    viewport?.addEventListener("resize", position);
    viewport?.addEventListener("scroll", position);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
      viewport?.removeEventListener("resize", position);
      viewport?.removeEventListener("scroll", position);
    };
  }, [root, options.length]);

  function open(option = selected ?? options[0]) {
    const button = trigger.current;
    if (!button || button.matches(":disabled") || !option) return;
    button.focus({ preventScroll: true });
    setActiveValue(option.value);
    setRoot(
      button.closest<HTMLElement>("dialog, [data-theme]") ?? document.body,
    );
  }

  function choose(option: Option<Value>) {
    if (trigger.current?.matches(":disabled")) return;
    trigger.current?.focus({ preventScroll: true });
    setRoot(null);
    if (option.value !== value) {
      setInvalid(false);
      onChange(option.value);
    }
  }

  function highlight(option: Option<Value> | undefined) {
    if (!option) return;
    if (!root) open(option);
    else {
      setActiveValue(option.value);
      if (listbox.current)
        revealOption(
          listbox.current,
          document.getElementById(optionId(option)),
        );
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const { key } = event;
    if (key === "Escape" && root) {
      event.preventDefault();
      event.stopPropagation();
      setRoot(null);
    } else if (key === "Tab" && root) {
      setRoot(null);
    } else if (root && active && (key === "Enter" || key === " ")) {
      event.preventDefault();
      choose(active);
    } else if (key === "Home" || key === "End") {
      event.preventDefault();
      highlight(key === "Home" ? options[0] : options.at(-1));
    } else if (key === "ArrowDown" || key === "ArrowUp") {
      event.preventDefault();
      const index = active ? options.indexOf(active) : 0;
      const next = index + (key === "ArrowDown" ? 1 : -1);
      highlight(
        root
          ? options[Math.max(0, Math.min(next, options.length - 1))]
          : key === "ArrowDown"
            ? (selected ?? options[0])
            : options[0],
      );
    } else if (
      key.length === 1 &&
      key !== " " &&
      !event.altKey &&
      !event.ctrlKey &&
      !event.metaKey
    ) {
      const time = event.timeStamp;
      const text =
        (time - search.current.time < 600 ? search.current.text : "") + key;
      search.current = { time, text };
      const query = normalizeSearch(text);
      const repeated =
        query.length > 1 &&
        [...query].every((character) => character === query[0]);
      const index = active ? options.indexOf(active) : -1;
      const start = query.length === 1 || repeated ? index + 1 : 0;
      const match = [...options.slice(start), ...options.slice(0, start)].find(
        (option) =>
          normalizeSearch(option.label).startsWith(repeated ? query[0] : query),
      );
      event.preventDefault();
      highlight(match);
    }
  }

  function renderOption(option: Option<Value>) {
    return (
      <div
        key={option.value}
        id={optionId(option)}
        role="option"
        aria-selected={value === option.value}
        data-value={option.value}
        data-active={active === option || undefined}
        className="themed-select-option"
        onMouseDown={(event) => event.preventDefault()}
        onPointerMove={(event) => {
          if (event.pointerType === "mouse") setActiveValue(option.value);
        }}
        onClick={() => choose(option)}
      >
        <span lang={option.lang}>{option.label}</span>
        {value === option.value && <Check aria-hidden="true" />}
      </div>
    );
  }

  return (
    <span
      className={cn(
        "relative min-w-0",
        field ? "field-label" : "block",
        className,
      )}
    >
      {field && <label htmlFor={`${id}-trigger`}>{label}</label>}
      <button
        ref={trigger}
        id={`${id}-trigger`}
        type="button"
        role="combobox"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={!!root}
        aria-controls={root ? id : undefined}
        aria-activedescendant={root && active ? optionId(active) : undefined}
        aria-required={required || undefined}
        aria-invalid={(invalid && !value) || undefined}
        aria-busy={busy || undefined}
        aria-describedby={
          describedBy ? `${id}-value ${describedBy}` : `${id}-value`
        }
        disabled={disabled || busy}
        data-toolbar={toolbar || undefined}
        data-compact={compact || undefined}
        className="themed-select-trigger"
        onKeyDown={onKeyDown}
        onBlur={() => setRoot(null)}
        onClick={() => {
          if (root) setRoot(null);
          else open();
        }}
      >
        {icon}
        <span
          id={`${id}-value`}
          className="themed-select-value"
          lang={selected?.lang}
        >
          {selected?.label}
        </span>
        {busy ? (
          <LoaderCircle
            className="themed-select-arrow animate-spin"
            aria-hidden="true"
          />
        ) : (
          <ChevronDown className="themed-select-arrow" aria-hidden="true" />
        )}
      </button>
      {required && (
        <input
          className="sr-only"
          type="text"
          tabIndex={-1}
          aria-hidden="true"
          autoComplete="off"
          value={value}
          required
          disabled={disabled}
          onChange={() => undefined}
          onInvalid={(event) => {
            event.preventDefault();
            setInvalid(true);
            trigger.current?.focus();
            open();
          }}
        />
      )}
      {root &&
        createPortal(
          <div
            ref={listbox}
            id={id}
            role="listbox"
            aria-label={label}
            className="themed-select-menu"
          >
            {Array.from(groups, ([name, items]) =>
              name ? (
                <div
                  key={name}
                  role="group"
                  aria-label={name}
                  className="themed-select-group"
                >
                  <div aria-hidden="true">{name}</div>
                  {items.map(renderOption)}
                </div>
              ) : (
                <Fragment key="ungrouped">{items.map(renderOption)}</Fragment>
              ),
            )}
          </div>,
          root,
        )}
    </span>
  );
}
