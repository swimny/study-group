import getpass

import bcrypt

password = getpass.getpass("공유 비밀번호를 입력하세요 (화면에 안 보임): ")
hashed = bcrypt.hashpw(password.encode(), bcrypt.gensalt())
print("\n.env.local 에 이 줄을 추가하세요:")
print(f"APP_PASSWORD_HASH={hashed.decode()}")