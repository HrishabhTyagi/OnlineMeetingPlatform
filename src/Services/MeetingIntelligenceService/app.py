import json
import logging
import os
import subprocess
import tempfile
from pathlib import Path

import pika
import requests
from faster_whisper import WhisperModel


logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"), format="%(asctime)s %(levelname)s %(message)s")
LOGGER = logging.getLogger("meeting-intelligence")

RABBIT_HOST = os.getenv("RABBITMQ_HOST", "localhost")
RABBIT_PORT = int(os.getenv("RABBITMQ_PORT", "5672"))
RABBIT_USER = os.getenv("RABBITMQ_USER", "samvaad")
RABBIT_PASSWORD = os.getenv("RABBITMQ_PASSWORD", "samvaad123")
RABBIT_VHOST = os.getenv("RABBITMQ_VHOST", "/")
RABBIT_EXCHANGE = os.getenv("RABBITMQ_EXCHANGE", "samvaad.events")
RABBIT_DEAD_LETTER_EXCHANGE = os.getenv("RABBITMQ_DEAD_LETTER_EXCHANGE", "samvaad.events.dead")
QUEUE_NAME = os.getenv("RABBITMQ_QUEUE", "meeting-intelligence-service.meeting.recording.ready")
RABBIT_DELIVERY_LIMIT = int(os.getenv("RABBITMQ_DELIVERY_LIMIT", "5"))
MEETING_SERVICE_URL = os.getenv("MEETING_SERVICE_URL", "http://localhost:5002").rstrip("/")
INTERNAL_API_KEY = os.environ["INTERNAL_API_KEY"]
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434").rstrip("/")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.1:8b")
WHISPER_MODEL = os.getenv("WHISPER_MODEL", "base")
WHISPER_DEVICE = os.getenv("WHISPER_DEVICE", "cpu")
WHISPER_COMPUTE_TYPE = os.getenv("WHISPER_COMPUTE_TYPE", "int8")


def request_headers(organization_id: str | None) -> dict[str, str]:
    headers = {"X-Samvaad-Internal-Key": INTERNAL_API_KEY}
    if organization_id:
        headers["X-Organization-Id"] = organization_id
    return headers


def download_recording(meeting_id: str, organization_id: str | None, target: Path) -> None:
    response = requests.get(
        f"{MEETING_SERVICE_URL}/api/internal/meetings/{meeting_id}/recording",
        headers=request_headers(organization_id),
        timeout=(10, 900),
    )
    response.raise_for_status()
    target.write_bytes(response.content)


def extract_audio(recording_path: Path, audio_path: Path) -> None:
    subprocess.run(
        ["ffmpeg", "-y", "-i", str(recording_path), "-vn", "-ac", "1", "-ar", "16000", str(audio_path)],
        check=True,
        capture_output=True,
        text=True,
    )


def transcribe(audio_path: Path, model: WhisperModel) -> tuple[str, list[dict[str, float | str]]]:
    segments, _ = model.transcribe(str(audio_path), vad_filter=True, word_timestamps=False)
    transcript_segments = [
        {"start": round(segment.start, 2), "end": round(segment.end, 2), "text": segment.text.strip()}
        for segment in segments
        if segment.text.strip()
    ]
    return "\n".join(segment["text"] for segment in transcript_segments), transcript_segments


def generate_minutes(transcript: str) -> tuple[str, list[dict[str, str | None]]]:
    prompt = f"""Create concise meeting minutes from this transcript. Do not invent facts.
Return JSON only with this schema:
{{"summary":"markdown summary with decisions and blockers", "actionItems":[{{"title":"specific task", "owner":"person name or null", "dueDate":"ISO date or null", "source":"supporting quote"}}]}}

Transcript:
{transcript}
"""
    response = requests.post(
        f"{OLLAMA_URL}/api/generate",
        json={"model": OLLAMA_MODEL, "prompt": prompt, "format": "json", "stream": False, "options": {"temperature": 0}},
        timeout=(10, 900),
    )
    response.raise_for_status()
    output = json.loads(response.json()["response"])
    summary = output.get("summary")
    action_items = output.get("actionItems", [])
    if not isinstance(summary, str) or not isinstance(action_items, list):
        raise ValueError("Ollama returned invalid meeting-minutes JSON")
    return summary, action_items


def post_result(meeting_id: str, organization_id: str | None, payload: dict) -> None:
    response = requests.post(
        f"{MEETING_SERVICE_URL}/api/internal/meetings/{meeting_id}/intelligence",
        headers={**request_headers(organization_id), "Content-Type": "application/json"},
        json={"organizationId": organization_id, **payload},
        timeout=(10, 60),
    )
    response.raise_for_status()


def process_recording(message: dict, model: WhisperModel) -> None:
    if not message.get("transcriptionRequested", False):
        LOGGER.info("Skipping meeting %s because transcription is disabled", message["meetingId"])
        return

    meeting_id = message["meetingId"]
    organization_id = message.get("organizationId")
    recording_url = message["recordingUrl"]
    with tempfile.TemporaryDirectory(prefix="samvaad-intelligence-") as directory:
        recording_path = Path(directory) / "recording.webm"
        audio_path = Path(directory) / "audio.wav"
        download_recording(meeting_id, organization_id, recording_path)
        extract_audio(recording_path, audio_path)
        transcript, segments = transcribe(audio_path, model)
        summary, action_items = generate_minutes(transcript)
        post_result(meeting_id, organization_id, {
            "recordingUrl": recording_url,
            "status": "Completed",
            "transcript": transcript,
            "transcriptSegmentsJson": json.dumps(segments),
            "summary": summary,
            "actionItemsJson": json.dumps(action_items),
        })
        LOGGER.info("Completed meeting intelligence for %s", meeting_id)


def on_message(channel, delivery, _, body, model: WhisperModel) -> None:
    message: dict = {}
    try:
        message = json.loads(body)
        if not isinstance(message, dict):
            raise ValueError("RabbitMQ event payload must be a JSON object")
        process_recording(message, model)
        channel.basic_ack(delivery_tag=delivery.delivery_tag)
    except Exception as error:
        LOGGER.exception("Meeting intelligence failed for event %s", message.get("eventId"))
        try:
            meeting_id = message.get("meetingId")
            recording_url = message.get("recordingUrl")
            if meeting_id and recording_url:
                post_result(meeting_id, message.get("organizationId"), {
                    "recordingUrl": recording_url,
                    "status": "Failed",
                    "error": str(error),
                })
                channel.basic_ack(delivery_tag=delivery.delivery_tag)
            else:
                raise ValueError("Failed event does not contain meetingId and recordingUrl")
        except Exception:
            channel.basic_nack(delivery_tag=delivery.delivery_tag, requeue=True)


def main() -> None:
    model = WhisperModel(WHISPER_MODEL, device=WHISPER_DEVICE, compute_type=WHISPER_COMPUTE_TYPE)
    credentials = pika.PlainCredentials(RABBIT_USER, RABBIT_PASSWORD)
    parameters = pika.ConnectionParameters(RABBIT_HOST, RABBIT_PORT, RABBIT_VHOST, credentials, heartbeat=60)
    connection = pika.BlockingConnection(parameters)
    channel = connection.channel()
    channel.exchange_declare(exchange=RABBIT_EXCHANGE, exchange_type="topic", durable=True)
    channel.exchange_declare(exchange=RABBIT_DEAD_LETTER_EXCHANGE, exchange_type="topic", durable=True)
    channel.queue_declare(
        queue=QUEUE_NAME,
        durable=True,
        arguments={
            "x-queue-type": "quorum",
            "x-delivery-limit": max(1, RABBIT_DELIVERY_LIMIT),
            "x-dead-letter-exchange": RABBIT_DEAD_LETTER_EXCHANGE,
            "x-dead-letter-routing-key": "meeting.recording.ready",
        },
    )
    channel.queue_bind(queue=QUEUE_NAME, exchange=RABBIT_EXCHANGE, routing_key="meeting.recording.ready")
    channel.basic_qos(prefetch_count=1)
    channel.basic_consume(queue=QUEUE_NAME, on_message_callback=lambda *args: on_message(*args, model))
    LOGGER.info("Listening for recording events on %s", QUEUE_NAME)
    channel.start_consuming()


if __name__ == "__main__":
    main()