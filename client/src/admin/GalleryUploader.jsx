import { useEffect, useRef, useState } from 'react';
import { admin } from '../lib/adminApi.js';
import { uploadImage } from '../lib/upload.js';
import { Num } from '../lib/bidi.jsx';
import BeforeAfterSlider from '../components/BeforeAfterSlider.jsx';

/**
 * ===========================================================================
 *  גלריה
 * ===========================================================================
 *
 * A barber shoots two photos on their phone and wants them on the site before
 * the next client sits down. So: two tap targets, a preview, one publish
 * button. No cropper, no filters, no drag-and-drop zone — nobody drags files
 * on a phone.
 *
 * The preview uses the SAME BeforeAfterSlider the public site renders. That is
 * the whole quality-control step: the barber drags the divider once and sees
 * exactly what a client will see, including whether the two shots line up. A
 * static side-by-side thumbnail would hide the only mistake that matters here
 * — heads at different distances from the camera.
 *
 * Uploads go browser → object storage directly (see lib/upload.js); only the
 * URLs come back through the API.
 */
export default function GalleryUploader() {
  const [items, setItems] = useState([]);
  const [before, setBefore] = useState(null); // { file, preview, progress }
  const [after, setAfter] = useState(null);
  const [caption, setCaption] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    admin
      .gallery()
      .then((d) => setItems(d.items))
      .catch(() => {});
  }, []);

  // Object URLs are a real leak on a phone — a few 5MB photos held open adds
  // up fast. Revoke as soon as the slot changes or the screen unmounts.
  useEffect(
    () => () => {
      if (before?.preview) URL.revokeObjectURL(before.preview);
      if (after?.preview) URL.revokeObjectURL(after.preview);
    },
    [before?.preview, after?.preview]
  );

  const pick = (slot, setSlot) => (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (slot?.preview) URL.revokeObjectURL(slot.preview);
    // Show the local file instantly; the upload happens on publish so the
    // barber can swap a shot without burning bandwidth twice.
    setSlot({ file, preview: URL.createObjectURL(file), progress: 0 });
    setError(null);
  };

  async function publish() {
    if (!before?.file || !after?.file) return;
    setPublishing(true);
    setError(null);

    try {
      const [beforeUrl, afterUrl] = await Promise.all([
        uploadImage(before.file, (p) => setBefore((s) => ({ ...s, progress: p }))),
        uploadImage(after.file, (p) => setAfter((s) => ({ ...s, progress: p }))),
      ]);

      const { item } = await admin.addGalleryItem({
        beforeUrl,
        afterUrl,
        caption: caption.trim() || undefined,
      });

      setItems((list) => [...list, item]);
      setBefore(null);
      setAfter(null);
      setCaption('');
    } catch (err) {
      setError(err.message);
    } finally {
      setPublishing(false);
    }
  }

  const ready = before?.preview && after?.preview;
  const uploading = publishing && (before?.progress < 1 || after?.progress < 1);

  return (
    <div className="px-5 pb-28 pt-7">
      <h1 className="font-display text-d3 font-semibold text-espresso">גלריה</h1>
      <p className="he-body mt-2 text-note text-cocoa">
        שתי תמונות מאותה זווית. גררו את התצוגה כדי לוודא שהן מיושרות.
      </p>

      <div className="mt-6 grid grid-cols-2 gap-3">
        <Slot label="לפני" slot={before} onPick={pick(before, setBefore)} />
        <Slot label="אחרי" slot={after} onPick={pick(after, setAfter)} accent />
      </div>

      {ready && (
        <div className="mt-6">
          <BeforeAfterSlider beforeUrl={before.preview} afterUrl={after.preview} priority hint={false} />

          <input
            type="text"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            maxLength={140}
            placeholder="משיער מגודל לפייד"
            className="mt-4 w-full rounded-plate border-2 border-sand bg-white px-4 py-3.5 text-base text-espresso placeholder:text-haze focus:border-espresso"
          />

          {uploading && (
            <div className="mt-4 h-1.5 w-full overflow-hidden rounded-pill bg-sand">
              <div
                className="h-full rounded-pill bg-mint transition-[width] duration-300 ease-lux"
                style={{ width: `${Math.round(((before.progress + after.progress) / 2) * 100)}%` }}
              />
            </div>
          )}

          {error && (
            <p role="alert" className="mt-4 rounded-plate bg-pomegranate-soft px-4 py-3 text-note text-pomegranate-deep">
              {error}
            </p>
          )}

          <button
            type="button"
            onClick={publish}
            disabled={publishing}
            className="mt-5 w-full rounded-pill bg-mint py-4 text-base font-semibold text-white shadow-pop transition-[transform,background-color,opacity] duration-300 ease-lux active:scale-[0.98] disabled:opacity-40"
          >
            {publishing ? 'מעלים…' : 'לפרסם באתר'}
          </button>
        </div>
      )}

      {items.length > 0 && (
        <div className="mt-12">
          <h2 className="text-note font-semibold text-espresso">
            באתר · <Num>{items.length}</Num>
          </h2>
          <div className="mt-4 space-y-3">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-4 rounded-plate border-2 border-sand bg-white p-3"
              >
                <img src={item.afterUrl} alt="" className="h-14 w-14 shrink-0 rounded-plate object-cover" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-note font-semibold text-espresso">
                    {item.caption ?? 'בלי כיתוב'}
                  </p>
                  <p className="mt-0.5 text-micro text-haze">{item.published ? 'מוצג' : 'מוסתר'}</p>
                </div>

                <button
                  type="button"
                  onClick={async () => {
                    const next = !item.published;
                    // Optimistic: the barber sees the toggle move immediately,
                    // and a failed request is rarer than a slow one.
                    setItems((list) => list.map((i) => (i.id === item.id ? { ...i, published: next } : i)));
                    await admin
                      .updateGalleryItem(item.id, { published: next })
                      .catch(() =>
                        setItems((list) =>
                          list.map((i) => (i.id === item.id ? { ...i, published: !next } : i))
                        )
                      );
                  }}
                  className="shrink-0 rounded-pill border-2 border-sand bg-white px-4 py-1.5 text-micro font-semibold text-cocoa transition-colors duration-300 hover:border-cocoa/40"
                >
                  {item.published ? 'להסתיר' : 'להציג'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * One photo slot.
 *
 * `capture="environment"` opens the rear camera straight from the shop floor;
 * the picker still offers the camera roll, so it costs nothing and saves a tap
 * in the common case of shooting it right there.
 */
function Slot({ label, slot, onPick, accent }) {
  const inputRef = useRef(null);

  return (
    <div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className={[
          'relative aspect-[4/5] w-full overflow-hidden rounded-plate border-2 transition-colors duration-300 ease-lux',
          slot ? (accent ? 'border-mint' : 'border-cocoa') : 'border-dashed border-sand hover:border-cocoa/40',
        ].join(' ')}
      >
        {slot ? (
          <img src={slot.preview} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full flex-col items-center justify-center gap-2 bg-white">
            <span
              className={`flex h-10 w-10 items-center justify-center rounded-pill ${
                accent ? 'bg-mint-soft' : 'bg-shell'
              }`}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M12 5v14M5 12h14"
                  stroke={accent ? '#D6CB98' : '#D0BF98'}
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
            </span>
            <span className="text-note font-semibold text-cocoa">{label}</span>
          </span>
        )}
      </button>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={onPick}
        className="sr-only"
        aria-label={`לבחור תמונת ${label}`}
      />
    </div>
  );
}
