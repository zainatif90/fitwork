"""
Passwords that attackers try first. Registration and password reset refuse them (compared in lower case).

FitWork already requires 8+ characters with a letter AND a number, so only common passwords of that shape are
listed: the letter+number entries near the top of public leaked-password lists (e.g. "password1", "abc12345"),
plus local favourites ("pakistan123") and the site's own name. A short list keeps the check easy to explain;
a full breach database (e.g. the Have I Been Pwned API) is listed as future work.
"""
COMMON_PASSWORDS = frozenset({
    "password1", "password12", "password123", "password1234", "passw0rd", "p@ssw0rd", "p@ssword1", "1password",
    "mypassword1", "password2", "abc12345", "abcd1234", "a1b2c3d4", "12345abc", "123456abc", "abc123456",
    "qwerty123", "qwerty12", "qwerty1234", "qwer1234", "1qaz2wsx", "1q2w3e4r", "q1w2e3r4", "zaq12wsx",
    "qweasd123", "123qweasd", "qwe123456", "asdf1234", "zxcvbnm1", "qwertyuiop1", "test1234", "test12345",
    "user1234", "pass1234", "admin123", "admin1234", "administrator1", "root1234", "changeme1", "welcome1",
    "welcome123", "hello123", "hello1234", "iloveyou1", "iloveyou2", "love1234", "letmein1", "letmein123",
    "trustno1", "monkey123", "dragon123", "master123", "shadow123", "superman1", "football1", "baseball1",
    "sunshine1", "princess1", "freedom1", "michael1", "charlie1", "jordan23", "computer1", "internet1",
    "pakistan1", "pakistan12", "pakistan123", "pakistan786", "lahore123", "karachi123", "islamabad1",
    "786786786a", "fitwork1", "fitwork123", "freelancer1", "freelance1",
})


def is_common_password(password: str) -> bool:
    return password.strip().lower() in COMMON_PASSWORDS
