"""Team chat: who can read and write which channel, unread counts and call links."""
from fastapi.testclient import TestClient

from tests.conftest import auth_header, register
from tests.test_agency import PYTHON_PROFILE, REACT_PROFILE, invite_and_join, jobs, member_id, team  # noqa: F401

BASE = "/api/agency/chat"


def send(client: TestClient, token: str, key: str, body: str):
    return client.post(f"{BASE}/channels/{key}/messages", json={"body": body}, headers=auth_header(token))


def read(client: TestClient, token: str, key: str):
    return client.get(f"{BASE}/channels/{key}/messages", headers=auth_header(token))


def channels(client: TestClient, token: str) -> dict:
    res = client.get(f"{BASE}/channels", headers=auth_header(token))
    assert res.status_code == 200, res.text
    return res.json()


def test_team_channel_is_shared_and_unread_counts_work(client: TestClient, team: dict) -> None:
    assert send(client, team["owner"], "team", "  Welcome to the team!  ").status_code == 201
    # Both members see one unread message; the sender does not
    assert channels(client, team["py"])["unread_total"] == 1
    assert channels(client, team["owner"])["unread_total"] == 0
    msgs = read(client, team["py"], "team").json()
    assert [m["body"] for m in msgs] == ["Welcome to the team!"]  # trimmed
    assert msgs[0]["sender_name"] == "Olivia Owner"
    assert channels(client, team["py"])["unread_total"] == 0  # opening the channel marks it read
    assert client.get(f"{BASE}/unread", headers=auth_header(team["rx"])).json() == {"unread": 1}


def test_direct_messages_are_private(client: TestClient, team: dict) -> None:
    py, rx = member_id(client, team["py"]), member_id(client, team["rx"])
    assert send(client, team["py"], f"dm-{rx}", "Hi Rex, quick question").status_code == 201
    # Rex sees it under the chat with Pyra; it is the same conversation from both sides
    assert [m["body"] for m in read(client, team["rx"], f"dm-{py}").json()] == ["Hi Rex, quick question"]
    # The owner cannot open a chat between two members (there is no such key for them)
    owner_id = member_id(client, team["owner"])
    assert all(m["body"] != "Hi Rex, quick question" for m in read(client, team["owner"], f"dm-{py}").json())
    assert read(client, team["owner"], f"dm-{owner_id}").status_code == 404  # no chat with yourself


def test_job_thread_only_for_owner_and_assignee(client: TestClient, team: dict, jobs: dict) -> None:
    py = member_id(client, team["py"])
    assert client.post("/api/agency/assign", json={"job_id": jobs["py"], "member_id": py},
                       headers=auth_header(team["owner"])).status_code == 201
    key = f"job-{jobs['py']}"
    assert send(client, team["owner"], key, "Client wants it by Friday").status_code == 201
    assert read(client, team["py"], key).status_code == 200
    assert read(client, team["rx"], key).status_code == 404  # not assigned to Rex
    assert send(client, team["rx"], key, "sneaky").status_code == 404
    assert any(c["key"] == key for c in channels(client, team["py"])["channels"])
    assert not any(c["key"] == key for c in channels(client, team["rx"])["channels"])
    # A job nobody in the agency has is not a chat at all
    assert read(client, team["owner"], f"job-{jobs['logo']}").status_code == 404


def test_outsiders_and_bad_keys_are_refused(client: TestClient, team: dict) -> None:
    outsider = register(client, email="solo@example.com")["access_token"]
    assert read(client, outsider, "team").status_code == 403
    assert client.get(f"{BASE}/unread", headers=auth_header(outsider)).json() == {"unread": 0}
    # Another agency cannot see this agency's team channel
    other_owner = register(client, email="other@example.com", role="agency_owner")["access_token"]
    send(client, team["owner"], "team", "private plans")
    assert read(client, other_owner, "team").json() == []
    for bad in ["nope", "job-123", "dm-not-a-uuid", "team2"]:
        assert read(client, team["py"], bad).status_code == 404
    assert send(client, team["py"], "team", "   ").status_code == 422
    assert send(client, team["py"], "team", "x" * 2001).status_code == 422


def test_removed_member_loses_access(client: TestClient, team: dict) -> None:
    send(client, team["owner"], "team", "hello")
    row = next(m for m in client.get("/api/agency/me", headers=auth_header(team["owner"])).json()["members"]
               if m["name"] == "Rex React")
    assert client.delete(f"/api/agency/members/{row['id']}", headers=auth_header(team["owner"])).status_code == 204
    assert read(client, team["rx"], "team").status_code == 403


def test_call_creates_a_private_jitsi_link(client: TestClient, team: dict) -> None:
    res = client.post(f"{BASE}/channels/team/call", headers=auth_header(team["py"]))
    assert res.status_code == 201
    body = res.json()
    assert body["kind"] == "call" and body["body"].startswith("https://meet.jit.si/FitWork-")
    second = client.post(f"{BASE}/channels/team/call", headers=auth_header(team["py"])).json()
    assert second["body"] != body["body"]  # every call gets its own unguessable room
    preview = next(c for c in channels(client, team["owner"])["channels"] if c["key"] == "team")["last_message"]
    assert preview == "Pyra: started a video call"


def test_messages_after_returns_only_new_ones(client: TestClient, team: dict) -> None:
    first = send(client, team["owner"], "team", "one").json()
    send(client, team["py"], "team", "two")
    newer = client.get(f"{BASE}/channels/team/messages", params={"after": first["created_at"]},
                       headers=auth_header(team["rx"])).json()
    assert [m["body"] for m in newer] == ["two"]


def test_chat_is_rate_limited(client: TestClient, team: dict) -> None:
    codes = [send(client, team["py"], "team", f"m{i}").status_code for i in range(32)]
    assert codes[:30] == [201] * 30 and codes[-1] == 429
