"""The PDF url_fetcher against the REAL WeasyPrint — not the stub test_esign
uses. Regression for the drawn-signature outage: WeasyPrint 70 started
requiring a urls.URLFetcher instance, and the first document to embed an
image (a drawn signature's data: PNG) crashed the render with
AttributeError: 'function' object has no attribute '_fail_on_errors'.

Skipped where WeasyPrint's native libraries (pango/cairo) aren't present,
e.g. the CI unit-test job; the e2e job renders real PDFs and covers it
there."""
import pytest

try:
    from weasyprint import HTML
except OSError as exc:  # pragma: no cover - missing libpango/libcairo
    pytest.skip(f"WeasyPrint native libs unavailable: {exc}", allow_module_level=True)

from app.pdf import MAX_DATA_URI_BYTES, safe_url_fetcher

# 1x1 transparent PNG.
PNG = (
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwC"
    "AAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
)


def _render(body: str) -> bytes:
    return HTML(string=f"<html><body>{body}</body></html>", url_fetcher=safe_url_fetcher()).write_pdf()


def test_data_uri_image_renders():
    """The drawn-signature case: an embedded data: image must render."""
    pdf = _render(f'<p>sig</p><img src="{PNG}" alt="signature">')
    assert pdf.startswith(b"%PDF")


def test_external_url_is_refused_but_not_fatal():
    """SSRF lockdown: an http(s) image is never fetched, and the refusal is
    a skipped resource, not a failed render."""
    pdf = _render('<img src="https://example.invalid/never-fetched.png" alt="x">')
    assert pdf.startswith(b"%PDF")


def test_oversized_data_uri_is_refused_but_not_fatal():
    huge = "data:image/png;base64," + "A" * (MAX_DATA_URI_BYTES + 1)
    pdf = _render(f'<img src="{huge}" alt="x">')
    assert pdf.startswith(b"%PDF")


def test_fetcher_is_a_weasyprint_fetcher_instance():
    """What WeasyPrint >= 70 actually requires of url_fetcher."""
    f = safe_url_fetcher()
    assert hasattr(f, "_fail_on_errors")
    assert f._allowed_protocols == {"data"}
    # Fresh instance per render (OpenerDirector keeps per-request state).
    assert safe_url_fetcher() is not f
