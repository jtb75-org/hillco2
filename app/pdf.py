"""WeasyPrint helpers."""

from weasyprint.urls import URLFetcher

# Cap on a single data: URI passed through to WeasyPrint. Defends against
# pathological large embedded images / fonts triggering OOM during PDF
# render. Templates today escape user input; this cap is defense-in-depth
# for a future change that ever marks user content `|safe`.
MAX_DATA_URI_BYTES = 5 * 1024 * 1024


class SafeURLFetcher(URLFetcher):
    """A WeasyPrint url_fetcher that only allows data: URIs.

    Rejects http(s)/file/ftp/etc so that no template change (including a
    future `|safe` regression that lets a `<img src="https://attacker">`
    slip into the rendered HTML) can trigger an outbound fetch during
    PDF generation. Without this lockdown, WeasyPrint would happily
    resolve such URLs server-side, turning template injection into SSRF.

    WeasyPrint >= 70 requires the fetcher to be a ``urls.URLFetcher``
    instance (it reads ``_fail_on_errors`` off it) rather than a bare
    function — a plain callable now crashes the render with
    AttributeError the first time a document embeds an image, which is
    exactly what a drawn e-signature does. Its native ``allowed_protocols``
    does the scheme lockdown; a rejected URL raises inside ``fetch`` and
    WeasyPrint treats that as a non-fatal missing resource (warning, image
    skipped), the same as before.
    """

    def __init__(self) -> None:
        super().__init__(allowed_protocols={"data"})

    def fetch(self, url: str, headers=None):
        if url.startswith("data:") and len(url) > MAX_DATA_URI_BYTES:
            raise ValueError(
                f"WeasyPrint refused oversized data: URI ({len(url)} bytes, "
                f"max {MAX_DATA_URI_BYTES})"
            )
        return super().fetch(url, headers)


def safe_url_fetcher() -> SafeURLFetcher:
    """A fresh fetcher per render. URLFetcher is a urllib OpenerDirector
    that keeps per-request state on the instance, so one must not be
    shared between concurrent renders."""
    return SafeURLFetcher()
