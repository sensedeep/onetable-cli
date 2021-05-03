all: build

build:
	npm run build

publish: build
	npm publish

promote: publish

install: build
	npm install . -g

update:
	npm update dynamodb-onetable
	npm i --package-lock-only
