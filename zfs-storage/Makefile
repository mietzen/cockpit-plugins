PLUGIN_NAME = zfs-storage
HELPER_NAME = cockpit-zfs
DIST_DIR = dist
BUILD_DIR = build

.PHONY: all build clean install deploy deb

all: build

build:
	npm install
	npm run build
	cp manifest.json $(DIST_DIR)/
	mkdir -p $(DIST_DIR)/backend
	cp -r backend/* $(DIST_DIR)/backend/

clean:
	rm -rf $(DIST_DIR) $(BUILD_DIR) node_modules

install: build
	mkdir -p /usr/share/cockpit/$(PLUGIN_NAME)
	mkdir -p /usr/libexec/$(HELPER_NAME)
	cp -r $(DIST_DIR)/* /usr/share/cockpit/$(PLUGIN_NAME)/
	cp -r backend/* /usr/libexec/$(HELPER_NAME)/
	chmod +x /usr/libexec/$(HELPER_NAME)/zfs_helper.py

deploy: build
	@if [ -z "$(TARGET)" ]; then 		echo "Usage: make deploy TARGET=user@host"; 		exit 1; 	fi
	ssh -o StrictHostKeyChecking=no $(TARGET) "sudo mkdir -p /usr/share/cockpit/$(PLUGIN_NAME) /usr/libexec/$(HELPER_NAME)"
	scp -r -o StrictHostKeyChecking=no $(DIST_DIR)/* $(TARGET):/tmp/cockpit-zfs-dist/ 2>/dev/null || (ssh -o StrictHostKeyChecking=no $(TARGET) "mkdir -p /tmp/cockpit-zfs-dist" && scp -r -o StrictHostKeyChecking=no $(DIST_DIR)/* $(TARGET):/tmp/cockpit-zfs-dist/)
	scp -r -o StrictHostKeyChecking=no backend/* $(TARGET):/tmp/cockpit-zfs-backend/ 2>/dev/null || (ssh -o StrictHostKeyChecking=no $(TARGET) "mkdir -p /tmp/cockpit-zfs-backend" && scp -r -o StrictHostKeyChecking=no backend/* $(TARGET):/tmp/cockpit-zfs-backend/)
	ssh -o StrictHostKeyChecking=no $(TARGET) "sudo cp -r /tmp/cockpit-zfs-dist/* /usr/share/cockpit/$(PLUGIN_NAME)/ && sudo cp -r /tmp/cockpit-zfs-backend/* /usr/libexec/$(HELPER_NAME)/ && sudo chmod +x /usr/libexec/$(HELPER_NAME)/zfs_helper.py"
	@echo "Deployment of $(PLUGIN_NAME) to $(TARGET) complete!"
