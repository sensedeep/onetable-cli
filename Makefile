all: build

build:
	npm run build

publish: build
	npm publish

install: build
	npm install . -g
