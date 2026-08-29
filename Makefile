.PHONY: all build build-zfs deb apt-repo clean install deploy e2e

all: build deb

build: build-zfs

build-zfs:
	@echo "==> Building zfs-storage plugin..."
	$(MAKE) -C zfs-storage build

deb: build
	@echo "==> Packaging Debian packages..."
	mkdir -p dist-debs
	python3 tools/build_deb.py zfs-storage --output-dir dist-debs --version 1.0.0

apt-repo: deb
	@echo "==> Generating APT repository for GitHub Pages..."
	python3 tools/generate_apt_repo.py --deb-dir dist-debs --output-dir pages --owner mietzen --repo cockpit-plugins

install: build
	$(MAKE) -C zfs-storage install

deploy: build
	$(MAKE) -C zfs-storage deploy TARGET=$(TARGET)

e2e:
	@echo "==> Running Playwright E2E tests..."
	npx playwright test --config e2e/playwright.config.ts

clean:
	rm -rf dist dist-debs pages build
	$(MAKE) -C zfs-storage clean
