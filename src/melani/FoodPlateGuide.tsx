/**
 * Trash can hard ban + green gift (protein / vegetables).
 * Default: list only — no pen chrome, no empty gap.
 * Hover the thin edge under the last row → pen (+ plus) bottom-left.
 */
import { useEffect, useMemo, useState } from "react";
import type { MacroSlice } from "./foodGuide";
import {
  addDietItem,
  hydrateDietListsFromDisk,
  loadDietLists,
  removeDietItem,
  renameDietItem,
  type ApprovedBucketId,
  type DietListsState,
} from "./dietListsStore";
import "./food-plate-guide.css";

type Props = {
  today: MacroSlice;
  hitLabels?: string[];
};

/** Visible gift buckets only — no nuts (owner knows those). */
const GIFT_META: { id: Exclude<ApprovedBucketId, "nuts">; label: string }[] = [
  { id: "protein", label: "Protein" },
  { id: "vegetables", label: "Vegetables" },
];

type EditSide = "trash" | "gift" | null;

function PenIcon() {
  return (
    <svg
      className="fx-diet-edge-icon"
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <path
        d="M4 20h4.5L19 9.5a1.5 1.5 0 0 0 0-2.12L16.62 5a1.5 1.5 0 0 0-2.12 0L4 15.5V20z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M13.5 6.5l4 4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg
      className="fx-diet-edge-icon"
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <path
        d="M12 5v14M5 12h14"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Bottom-left edge tools — invisible until hover on the strip under the list. */
function DietEdgeTools({
  tone,
  editing,
  onToggleEdit,
  onAdd,
  editLabel,
  addLabel,
}: {
  tone: "bin" | "gift";
  editing: boolean;
  onToggleEdit: () => void;
  onAdd: () => void;
  editLabel: string;
  addLabel: string;
}) {
  return (
    <div
      className={`fx-diet-edge fx-diet-edge-${tone}${editing ? " is-open" : ""}`}
    >
      <div className="fx-diet-edge-tools">
        <button
          type="button"
          className={`fx-diet-edge-btn fx-diet-edge-pen${
            editing ? " is-on" : ""
          }`}
          aria-label={editing ? `Done ${editLabel}` : editLabel}
          aria-pressed={editing}
          onClick={onToggleEdit}
        >
          <PenIcon />
        </button>
        <button
          type="button"
          className="fx-diet-edge-btn fx-diet-edge-plus"
          aria-label={addLabel}
          onClick={onAdd}
        >
          <PlusIcon />
        </button>
      </div>
    </div>
  );
}

export function FoodPlateGuide({ hitLabels = [] }: Props) {
  const hitSet = useMemo(() => new Set(hitLabels), [hitLabels]);
  const hitCount = hitSet.size;
  const [tossed, setTossed] = useState<string | null>(null);
  const [rattle, setRattle] = useState(false);
  const [lists, setLists] = useState<DietListsState>(() => loadDietLists());
  const [editSide, setEditSide] = useState<EditSide>(null);
  const [trashDraft, setTrashDraft] = useState("");
  const [addDraft, setAddDraft] = useState<Record<"protein" | "vegetables", string>>({
    protein: "",
    vegetables: "",
  });
  const [renaming, setRenaming] = useState<{
    bucket: "trash" | "protein" | "vegetables";
    from: string;
  } | null>(null);
  const [editValue, setEditValue] = useState("");

  useEffect(() => {
    void hydrateDietListsFromDisk().then(setLists);
  }, []);

  useEffect(() => {
    if (hitCount <= 0) return;
    setRattle(true);
    const t = window.setTimeout(() => setRattle(false), 700);
    return () => window.clearTimeout(t);
  }, [hitCount]);

  useEffect(() => {
    if (!tossed) return;
    const t = window.setTimeout(() => setTossed(null), 480);
    return () => window.clearTimeout(t);
  }, [tossed]);

  function closeEdit() {
    setEditSide(null);
    setRenaming(null);
    setEditValue("");
    setTrashDraft("");
    setAddDraft({ protein: "", vegetables: "" });
  }

  function toggleEdit(side: Exclude<EditSide, null>) {
    if (editSide === side) closeEdit();
    else {
      setEditSide(side);
      setRenaming(null);
      setEditValue("");
    }
  }

  /** + on the edge: open edit and focus the add field for that side. */
  function openAdd(side: Exclude<EditSide, null>) {
    setEditSide(side);
    setRenaming(null);
    setEditValue("");
  }

  function commitAdd(bucket: "trash" | "protein" | "vegetables", raw: string) {
    const t = raw.trim();
    if (t) setLists(addDietItem(bucket, t));
    if (bucket === "trash") setTrashDraft("");
    else setAddDraft((d) => ({ ...d, [bucket]: "" }));
    // Enter / submit closes edit chrome
    closeEdit();
  }

  function commitRemove(bucket: "trash" | "protein" | "vegetables", item: string) {
    setLists(removeDietItem(bucket, item));
    if (renaming?.from === item) setRenaming(null);
  }

  function startRename(bucket: "trash" | "protein" | "vegetables", item: string) {
    if (editSide === null) return;
    if (editSide === "trash" && bucket !== "trash") return;
    if (editSide === "gift" && bucket === "trash") return;
    setRenaming({ bucket, from: item });
    setEditValue(item);
  }

  function commitRename() {
    if (!renaming) return;
    setLists(renameDietItem(renaming.bucket, renaming.from, editValue));
    setRenaming(null);
    setEditValue("");
  }

  const trashEditing = editSide === "trash";
  const giftEditing = editSide === "gift";

  return (
    <section
      className="fx-section fx-plate"
      aria-label="Diet ban and approved lists"
    >
      <div className="fx-bin-gift-row">
        {/* ── Trash ── */}
        <div className="fx-bin-col">
          <p className="fx-bin-title">Trash can hard ban</p>
          <div
            className={`fx-bin fx-bin-solo${hitCount > 0 ? " is-dirty" : " is-clean"}${
              rattle ? " is-rattle" : ""
            }${trashEditing ? " is-editing" : ""}`}
          >
            <div className="fx-bin-silhouette">
              <div className="fx-bin-lid" aria-hidden>
                <span className="fx-bin-handle" />
                <span className="fx-bin-lidcap" />
              </div>

              <div className="fx-bin-vessel">
                <div className="fx-bin-flies" aria-hidden>
                  <i />
                  <i />
                  <i />
                </div>
                <ol className="fx-bin-list">
                  {lists.trash.map((item, i) => {
                    const hot = hitSet.has(item);
                    const yeet = tossed === item;
                    const isRen =
                      renaming?.bucket === "trash" && renaming.from === item;
                    return (
                      <li
                        key={`${item}-${i}`}
                        className={`${hot ? "is-hit" : ""}${
                          yeet ? " is-toss" : ""
                        }`}
                      >
                        {isRen ? (
                          <form
                            className="fx-diet-edit-row"
                            onSubmit={(e) => {
                              e.preventDefault();
                              commitRename();
                            }}
                          >
                            <span className="fx-bin-n">{i + 1}</span>
                            <input
                              className="fx-diet-input"
                              value={editValue}
                              autoFocus
                              onChange={(e) => setEditValue(e.target.value)}
                              onBlur={commitRename}
                              onKeyDown={(e) => {
                                if (e.key === "Escape") {
                                  e.preventDefault();
                                  setRenaming(null);
                                }
                              }}
                              aria-label="Edit trash item"
                            />
                          </form>
                        ) : (
                          <div
                            className={`fx-diet-row${
                              trashEditing ? " is-edit" : ""
                            }`}
                          >
                            <button
                              type="button"
                              className="fx-bin-row-btn"
                              onClick={() => setTossed(item)}
                              onDoubleClick={() => startRename("trash", item)}
                            >
                              <span className="fx-bin-n">{i + 1}</span>
                              <span className="fx-bin-item">{item}</span>
                              {hot ? (
                                <span className="fx-bin-zap" aria-hidden>
                                  ×
                                </span>
                              ) : null}
                            </button>
                            {trashEditing ? (
                              <button
                                type="button"
                                className="fx-diet-x"
                                aria-label={`Remove ${item}`}
                                onClick={() => commitRemove("trash", item)}
                              >
                                ×
                              </button>
                            ) : null}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ol>

                {trashEditing ? (
                  <form
                    className="fx-diet-add"
                    onSubmit={(e) => {
                      e.preventDefault();
                      commitAdd("trash", trashDraft);
                    }}
                  >
                    <input
                      className="fx-diet-input"
                      value={trashDraft}
                      autoFocus
                      onChange={(e) => setTrashDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") {
                          e.preventDefault();
                          closeEdit();
                        } else if (e.key === "Enter" && !trashDraft.trim()) {
                          e.preventDefault();
                          closeEdit();
                        }
                      }}
                      placeholder="Add ban…"
                      aria-label="Add trash item"
                    />
                    <button type="submit" className="fx-diet-add-btn">
                      Add
                    </button>
                  </form>
                ) : null}

                <DietEdgeTools
                  tone="bin"
                  editing={trashEditing}
                  onToggleEdit={() => toggleEdit("trash")}
                  onAdd={() => openAdd("trash")}
                  editLabel="Edit bans"
                  addLabel="Add ban"
                />
              </div>
            </div>
          </div>
        </div>

        {/* ── Green gift ── */}
        <div className="fx-bin-col">
          <p className="fx-gift-title">Approved</p>
          <div
            className={`fx-gift fx-gift-solo${giftEditing ? " is-editing" : ""}`}
            aria-label="Approved foods"
          >
            <div className="fx-gift-silhouette">
              <div className="fx-gift-lid" aria-hidden>
                <span className="fx-gift-handle" />
                <span className="fx-gift-lidcap" />
              </div>
              <div className="fx-gift-vessel">
                <ol className="fx-gift-list-root">
                  {GIFT_META.map((group) => (
                    <li key={group.id} className="fx-gift-group">
                      <p className="fx-gift-group-label">{group.label}</p>
                      <ol className="fx-gift-list">
                        {lists[group.id].map((item, i) => {
                          const isRen =
                            renaming?.bucket === group.id &&
                            renaming.from === item;
                          return (
                            <li key={`${group.id}-${item}-${i}`}>
                              {isRen ? (
                                <form
                                  className="fx-diet-edit-row fx-diet-edit-row-gift"
                                  onSubmit={(e) => {
                                    e.preventDefault();
                                    commitRename();
                                  }}
                                >
                                  <span className="fx-gift-n">{i + 1}</span>
                                  <input
                                    className="fx-diet-input fx-diet-input-gift"
                                    value={editValue}
                                    autoFocus
                                    onChange={(e) =>
                                      setEditValue(e.target.value)
                                    }
                                    onBlur={commitRename}
                                    onKeyDown={(e) => {
                                      if (e.key === "Escape") {
                                        e.preventDefault();
                                        setRenaming(null);
                                      }
                                    }}
                                    aria-label="Edit item"
                                  />
                                </form>
                              ) : (
                                <div
                                  className={`fx-diet-row fx-diet-row-gift${
                                    giftEditing ? " is-edit" : ""
                                  }`}
                                >
                                  <button
                                    type="button"
                                    className="fx-gift-row-btn"
                                    onDoubleClick={() =>
                                      startRename(group.id, item)
                                    }
                                  >
                                    <span className="fx-gift-n">{i + 1}</span>
                                    <span className="fx-gift-item">{item}</span>
                                  </button>
                                  {giftEditing ? (
                                    <button
                                      type="button"
                                      className="fx-diet-x fx-diet-x-gift"
                                      aria-label={`Remove ${item}`}
                                      onClick={() =>
                                        commitRemove(group.id, item)
                                      }
                                    >
                                      ×
                                    </button>
                                  ) : null}
                                </div>
                              )}
                            </li>
                          );
                        })}
                      </ol>
                      {giftEditing ? (
                        <form
                          className="fx-diet-add fx-diet-add-gift"
                          onSubmit={(e) => {
                            e.preventDefault();
                            commitAdd(group.id, addDraft[group.id]);
                          }}
                        >
                          <input
                            className="fx-diet-input fx-diet-input-gift"
                            value={addDraft[group.id]}
                            onChange={(e) =>
                              setAddDraft((d) => ({
                                ...d,
                                [group.id]: e.target.value,
                              }))
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Escape") {
                                e.preventDefault();
                                closeEdit();
                              } else if (
                                e.key === "Enter" &&
                                !addDraft[group.id].trim()
                              ) {
                                e.preventDefault();
                                closeEdit();
                              }
                            }}
                            placeholder="Add…"
                            aria-label={`Add ${group.label}`}
                          />
                          <button type="submit" className="fx-diet-add-btn">
                            Add
                          </button>
                        </form>
                      ) : null}
                    </li>
                  ))}
                </ol>

                <DietEdgeTools
                  tone="gift"
                  editing={giftEditing}
                  onToggleEdit={() => toggleEdit("gift")}
                  onAdd={() => openAdd("gift")}
                  editLabel="Edit approved"
                  addLabel="Add approved item"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
