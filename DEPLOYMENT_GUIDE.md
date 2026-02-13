# ERD SYSTEM 운영 서버 배포 상세 가이드 (Local Docker Build)

로컬 PC(Mac)에 **Docker**를 설치한 후, 이미지를 직접 빌드하여 운영 서버(`210.92.92.18:2000`)로 전송하는 가장 안정적인 배포 방식입니다. 이 방식은 운영 서버의 인터넷 환경이나 리소스에 구애받지 않고 배포할 수 있다는 장점이 있습니다.

---

## 💻 로컬 환경 준비 (Mac에 Docker 설치)

로컬 빌드를 위해 Docker가 필요합니다. Mac에서 가장 원활하게 설치하는 두 가지 방법을 소개합니다.

### 방법 1: Homebrew로 설치 (CLI 선호 시)
터미널을 열고 아래 명령어를 입력하여 **OrbStack**(가볍고 빠름) 또는 **Docker Desktop**을 설치합니다.

```bash
# 1. OrbStack 설치 (강력 추천: 매우 가볍고 빠름)
brew install --cask orbstack

# OR

# 2. Docker Desktop 설치 (공식 표준 프로그램)
brew install --cask docker
```

### 방법 2: 직접 다운로드
- **OrbStack**: [https://orbstack.dev/](https://orbstack.dev/)
- **Docker Desktop**: [https://www.docker.com/products/docker-desktop/](https://www.docker.com/products/docker-desktop/)

> [!NOTE]
> 설치 후 반드시 애플리케이션을 실행하여 Docker 엔진이 구동 중인지 확인(`docker ps` 명령어로 확인 가능)한 뒤 배포 단계를 진행해 주세요.

---

## 🏗 전체 시스템 구조
- **외부 접속 주소**: `http://210.92.92.18:2000/erd/`
- **Frontend 경로**: `/erd/` (Nginx Gateway 포워딩)
- **Backend API 경로**: `/erd-api/` (Prefix 제거 후 Backend 전송)
- **DB/Cache**: MongoDB, Redis (내부 컨테이너 네트워크 사용)

---

## 🚀 단계별 배포 절차

### 단계 1: 운영 서버 기초 설정 (최초 1회)
운영 서버(`192.168.0.141`)에 접속하여 데이터 보존을 위한 폴더를 생성합니다.

```bash
# 운영 서버 접속
ssh -p 22222 vims@192.168.0.141

# 프로젝트 관리 폴더 생성
mkdir -p ~/projects/erd-system/db_data
mkdir -p ~/projects/erd-system/redis_data

# 권한 설정 (데이터 쓰기 권한 확보)
chmod 777 ~/projects/erd-system/db_data
chmod 777 ~/projects/erd-system/redis_data

exit
```

---

### 단계 2: 로컬(Mac)에서 Docker 이미지 빌드 및 저장
로컬 PC에 Docker(Docker Desktop 또는 OrbStack)가 설치된 상태에서 진행합니다.

#### 1) 프론트엔드 빌드 및 이미지화
```bash
cd ~/ERD-SYSTEM

# 이미지 빌드 (.env.production 설정이 자동 포함됨)
# Mac(M1/M2)에서 빌드 시 서버(Linux/AMD64) 호환성을 위해 --platform 지정이 중요합니다.
docker build --platform linux/amd64 -t erd-frontend -f Dockerfile.frontend .
docker build --platform linux/amd64 -t erd-backend -f server/Dockerfile ./server

# 빌드된 이미지를 파일(.tar)로 추출
docker save erd-frontend > erd-frontend.tar
```

#### 2) 백엔드 이미지화
```bash
cd ~/ERD-SYSTEM

# 서버 폴더에서 이미지 빌드
docker build --platform linux/amd64 -t erd-backend -f server/Dockerfile ./server

# 빌드된 이미지를 파일(.tar)로 추출
docker save erd-backend > erd-backend.tar

#### 3) DB 및 Cache 이미지
DB와 Redis는 운영 서버에서 직접 다운로드(Pull)하므로 로컬에서 별도로 준비할 필요가 없습니다. (단계 4 참고)
```

---

### 단계 3: 이미지 및 설정 파일 전송
추출된 이미지 파일과 실행 설정 파일(`docker-compose.yml`)을 운영 서버로 보냅니다.

```bash
# 로컬 터미널에서 실행
cd ~/ERD-SYSTEM

# 이미지(.tar)와 실행 파일(yml) 전송
scp -P 22222 docker-compose.yml erd-frontend.tar erd-backend.tar vims@192.168.0.141:~/projects/erd-system/
```

---

### 단계 4: 운영 서버에서 이미지 로드 및 기동 (수동 방식)
운영 서버의 `podman-compose` 버전 호환성 문제를 방지하기 위해 `podman` 기본 명령어로 직접 실행합니다.

```bash
# 운영 서버 접속 및 폴더 이동
ssh -p 22222 vims@192.168.0.141
cd ~/projects/erd-system

# 1. 앱 이미지 파일 로드
podman load < erd-frontend.tar
podman load < erd-backend.tar

# 2. DB 및 Cache 이미지 직접 다운로드 (4.4 버전은 구형 CPU AVX 호환성용)
podman pull docker.io/library/mongo:4.4
podman pull docker.io/library/redis:7-alpine

# 3. 전용 네트워크 생성 (컨테이너 간 통신용)
podman network create erd-network

# 4. 서비스 실행 (한 줄씩 복사해서 실행하세요)
podman run -d --name erd-mongodb --network erd-network -p 27017:27017 -v ~/projects/erd-system/db_data:/data/db -e MONGO_INITDB_DATABASE=erd-system --restart unless-stopped docker.io/library/mongo:4.4
podman run -d --name erd-redis --network erd-network -p 6379:6379 -v ~/projects/erd-system/redis_data:/data --restart unless-stopped docker.io/library/redis:7-alpine redis-server --appendonly yes
podman run -d --name erd-backend --network erd-network -p 3001:3001 -e NODE_ENV=production -e MONGODB_URI=mongodb://erd-mongodb:27017/erd-system -e REDIS_HOST=erd-redis -e REDIS_PORT=6379 -e FRONTEND_URL=http://210.92.92.18:2000 -e BASE_PATH=/erd -e JWT_SECRET=production-secret-change-me --restart unless-stopped erd-backend
podman run -d --name erd-frontend --network erd-network -p 8085:80 --restart unless-stopped erd-frontend
```

---

### 단계 5: Nginx Gateway 설정 (2000번 포트용)
운영 서버의 공용 Nginx 설정에 아래 라우팅 규칙을 추가합니다.

```nginx
server {
    listen 8080; # 내부 포트 8080 (외부 2000으로 매핑된 포트)

    # 1. ERD 프론트엔드 (/erd/)
    location /erd/ {
        # 호스트 OS의 8085 포트로 연결
        proxy_pass http://host.containers.internal:8085/erd/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    # 2. ERD 백엔드 및 실시간 소켓 (/erd-api/)
    location /erd-api/ {
        rewrite ^/erd-api/(.*)$ /$1 break;
        proxy_pass http://host.containers.internal:3001;
        
        # 실시간 협업을 위한 WebSocket 프로토콜 지원
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

**설정 반영:**
```bash
sudo nginx -t
sudo nginx -s reload
```

---

## � 재배포 및 업데이트 절차 (Patch & Update)

소스 코드가 수정되었을 때 운영 서버에 반영하는 절차입니다.

### 1단계: 로컬(Mac)에서 이미지 재빌드 및 추출
```bash
cd ~/ERD-SYSTEM

# (선택) 프론트엔드/백엔드 수정 사항에 맞춰 빌드 (플랫폼 주의!)
docker build --platform linux/amd64 -t erd-frontend -f Dockerfile.frontend .
docker build --platform linux/amd64 -t erd-backend -f server/Dockerfile ./server

# .tar 파일로 저장
docker save erd-frontend > erd-frontend.tar
docker save erd-backend > erd-backend.tar
```

### 2단계: 신규 이미지 전송
```bash
scp -P 22222 erd-frontend.tar erd-backend.tar vims@192.168.0.141:~/projects/erd-system/
```

### 3단계: 운영 서버에서 기존 컨테이너 교체
```bash
# 서버 접속 및 이동
ssh -p 22222 vims@192.168.0.141
cd ~/projects/erd-system

# 1. 기존 컨테이너 중지 및 삭제 (DB/Redis는 데이터 유지가 필요하면 앱만 교체, 이번처럼 이슈 시 전체 교체)
podman rm -f erd-frontend erd-backend erd-mongodb

# 2. 신규 이미지 로드 및 호환 DB 다운로드
podman load < erd-frontend.tar
podman load < erd-backend.tar
podman pull docker.io/library/mongo:4.4

# 3. 서비스 재시작 (한 줄씩 복사)
podman run -d --name erd-mongodb --network erd-network -p 27017:27017 -v ~/projects/erd-system/db_data:/data/db -e MONGO_INITDB_DATABASE=erd-system --restart unless-stopped docker.io/library/mongo:4.4

podman run -d --name erd-backend --network erd-network -p 3001:3001 -e NODE_ENV=production -e MONGODB_URI=mongodb://erd-mongodb:27017/erd-system -e REDIS_HOST=erd-redis -e REDIS_PORT=6379 -e FRONTEND_URL=http://210.92.92.18:2000 -e BASE_PATH=/erd -e JWT_SECRET=production-secret-change-me --restart unless-stopped erd-backend

podman run -d --name erd-frontend --network erd-network -p 8085:80 --restart unless-stopped erd-frontend
```

---

## 🛠 유지보수 및 팁

- **로그 확인**: `podman logs -f erd-backend` 또는 `podman logs -f erd-frontend`
- **리소스 정리**: 빌드 파일이 쌓여 용량이 부족할 때 `podman image prune -a` (사용하지 않는 이미지 전체 삭제)
- **컨테이너 상태**: `podman ps -a` (실행 중이 아닌 컨테이너까지 확인)

---

## ✅ 최종 확인
1.  브라우저에서 `http://210.92.92.18:2000/erd/` 접속
2.  로그인 및 ERD 데이터 추가/수정 테스트
3.  다중 접속을 통한 실시간 커서 동기화 확인
