all: build

build:
	npm run build

publish: build
	npm publish

promote: publish

install: build
	npm install . -g
