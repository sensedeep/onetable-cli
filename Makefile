all: build

build:
	npm i --package-lock-only
	npm run build

publish: build
	npm publish

promote: publish

install: build
	npm install . -g

update:
	npm update dynamodb-onetable
	npm i --package-lock-only
