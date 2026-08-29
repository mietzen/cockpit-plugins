.PHONY: all build build-zfs deb apt-repo clean install deploy e2e

PLUGINS = $(wildcard plugins/*)

all: build deb

build: build-zfs

build-zfs:
	@echo "==> Building zfs-storage plugin..."
	$(MAKE) -C plugins/zfs-storage build

test:
	@echo "==> Running backend unit tests..."
	PYTHONPATH=plugins/zfs-storage pytest plugins/zfs-storage/backend/tests

deb: build
	@echo "==> Packaging Debian packages..."
	mkdir -p dist-debs
	tools/build_deb.sh plugins/zfs-storage 1.0.0 dist-debs

rpm: build
	@echo "==> Packaging RPM packages..."
	mkdir -p dist-rpms
	tools/build_rpm.sh plugins/zfs-storage 1.0.0 dist-rpms

apt-repo: deb
	@echo "==> Generating APT repository for GitHub Pages..."
	python3 tools/generate_apt_repo.py --deb-dir dist-debs --output-dir pages --owner mietzen --repo cockpit-plugins

install: build
	$(MAKE) -C plugins/zfs-storage install

deploy: build
	$(MAKE) -C plugins/zfs-storage deploy TARGET=$(TARGET)

e2e:
	@echo "==> Running Playwright E2E tests..."
	npx playwright test

clean:
	rm -rf dist dist-debs pages build
	$(MAKE) -C plugins/zfs-storage clean
