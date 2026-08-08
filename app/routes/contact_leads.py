from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, field_validator

from ..email import EmailSendError, send_email
from ..validators import EMAIL_PATTERN

router = APIRouter(prefix="/api", tags=["contact-leads"])

LEAD_RECIPIENT = "joe@ng20.org"


class ContactLeadCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    email: str = Field(pattern=EMAIL_PATTERN, max_length=320)
    phone: str | None = Field(default=None, max_length=80)
    message: str | None = Field(default=None, max_length=4000)

    @field_validator("name", "email", "phone", "message", mode="before")
    @classmethod
    def _strip_strings(cls, value):
        if isinstance(value, str):
            stripped = value.strip()
            return stripped or None
        return value


@router.post("/contact-lead", status_code=202)
async def create_contact_lead(body: ContactLeadCreate):
    message = body.message or "(No questions or comments provided.)"
    phone = body.phone or "(Not provided.)"
    text = (
        "New HillCo landing-page inquiry\n\n"
        f"Name: {body.name}\n"
        f"Email: {body.email}\n"
        f"Phone: {phone}\n\n"
        "Questions or comments:\n"
        f"{message}\n"
    )

    try:
        message_id = send_email(
            to=LEAD_RECIPIENT,
            subject=f"New HillCo inquiry from {body.name}",
            body_text=text,
            reply_to=body.email,
        )
    except EmailSendError as exc:
        raise HTTPException(status_code=502, detail="Unable to send contact email.") from exc

    return {"status": "accepted", "message_id": message_id}
