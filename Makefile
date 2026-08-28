PREFIX ?= /usr
COCKPIT_DIR ?= $(PREFIX)/share/cockpit/zfs-storage
LIBEXEC_DIR ?= $(PREFIX)/libexec/cockpit-zfs
TARGET ?= test-user@192.168.40.142

.PHONY: all build test test-backend install deploy clean

all: build

build:
	npm run build
	cp manifest.json dist/
	mkdir -p dist/backend
	cp -r backend/* dist/backend/

test: test-backend

test-backend:
	PYTHONPATH=. python3 -m unittest discover backend/tests

install: build
	mkdir -p $(DESTDIR)$(COCKPIT_DIR)
	cp -r dist/* $(DESTDIR)$(COCKPIT_DIR)/
	mkdir -p $(DESTDIR)$(LIBEXEC_DIR)
	cp -r backend/* $(DESTDIR)$(LIBEXEC_DIR)/
	chmod +x $(DESTDIR)$(LIBEXEC_DIR)/zfs_helper.py

deploy: build
	ssh -o StrictHostKeyChecking=no $(TARGET) "sudo mkdir -p /usr/share/cockpit/zfs-storage /usr/libexec/cockpit-zfs"
	scp -r -o StrictHostKeyChecking=no dist/* $(TARGET):/tmp/cockpit-zfs-dist/ 2>/dev/null || (ssh -o StrictHostKeyChecking=no $(TARGET) "mkdir -p /tmp/cockpit-zfs-dist" && scp -r -o StrictHostKeyChecking=no dist/* $(TARGET):/tmp/cockpit-zfs-dist/)
	scp -r -o StrictHostKeyChecking=no backend/* $(TARGET):/tmp/cockpit-zfs-backend/ 2>/dev/null || (ssh -o StrictHostKeyChecking=no $(TARGET) "mkdir -p /tmp/cockpit-zfs-backend" && scp -r -o StrictHostKeyChecking=no backend/* $(TARGET):/tmp/cockpit-zfs-backend/)
	ssh -o StrictHostKeyChecking=no $(TARGET) "sudo cp -r /tmp/cockpit-zfs-dist/* /usr/share/cockpit/zfs-storage/ && sudo cp -r /tmp/cockpit-zfs-backend/* /usr/libexec/cockpit-zfs/ && sudo chmod +x /usr/libexec/cockpit-zfs/zfs_helper.py"
	@echo "Deployment to $(TARGET) complete!"

clean:
	rm -rf dist node_modules
