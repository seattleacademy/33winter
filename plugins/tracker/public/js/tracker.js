(function(window, document) {
    'use strict';

    var Tracker = function Tracker(cockpit) {
        var tracker = this;
        console.log('Loading Tracker plugin');

        this.cockpit = cockpit;
        $('#controls').append('<input type="button" id="track" value="trackme">');

        this.frameWidth = 640;
        this.frameHeight = 360;

        this.newPyramid = new jsfeat.pyramid_t(3);
        this.oldPyramid = new jsfeat.pyramid_t(3);
        this.point_status = new Uint8Array(1);
        this.oldXY = new Float32Array(2);
        this.newXY = new Float32Array(2);
        this.oldRoundedX = 0;
        this.oldRoundedY = 0;

        this.canvas = document.querySelector('#dronestream canvas');
        if (!this.canvas) {
            console.error('Did not find required dronestream canvas');
            return;
        }
        console.log('found canvas, width/height:', this.canvas.clientWidth, this.canvas.clientHeight);

        // add click-handler
        $('#cockpit').append('<div id="tracker"></div>');
        this.div = $('#tracker').get(0);
        this.div.addEventListener('click', function(event) {
            tracker.setTrackingCoords(event.offsetX, event.offsetY);
        });

        this.enabled = false;
        this.observers = {};
        this.locked = false;

        $('#cockpit').append('<img id="tracker-crosshairs" src="/plugin/tracker/img/sniper.png">');
        this.crosshairs = $('#tracker-crosshairs').get(0);
        this.crosshairs.style.display = 'none';
        var gap = 0;
        var cCenter = 0;
        this.on('points', function(data) {
            //console.log("data", data[0].x, tracker.canvas.clientWidth);
            var hCenter = tracker.canvas.clientWidth / 2;
            var hgap = hCenter / 40;
            var newspeed = Math.abs(hCenter - data[0].x) / hCenter;
            console.log("speed", newspeed, "gap", hgap);
            if (data[0].x < (hCenter - hgap)) {
                console.log("turn left");
                tracker.cockpit.socket.emit("/pilot/move", {
                    action: 'counterClockwise',
                    speed: newspeed
                });
            } else
            if (data[0].x > hCenter + hgap) {
                console.log("turn right");
                tracker.cockpit.socket.emit("/pilot/move", {
                    action: 'clockwise',
                    speed: newspeed
                });
            } else {
                // tracker.cockpit.socket.emit("/pilot/drone", {
                //     action: 'stop'
                // });
                // console.log("don't move");
            }
            tracker.crosshairs.style.left = (data[0].x - 83) + 'px';
            tracker.crosshairs.style.top = (data[0].y - 83) + 'px';
            tracker.crosshairs.style.display = 'block';
        });




        this.on('points', function(data) {
            //console.log("data", data[0].y, tracker.canvas.clientHeight);
            var vCenter = tracker.canvas.clientHeight / 2;
            var vgap = vCenter / 40;
            var newspeed = Math.abs(vCenter - data[0].y) / vCenter;
            console.log("speed", newspeed, "gap", vgap);
            if (data[0].y < (vCenter - vgap)) {
                console.log("ascend");
                tracker.cockpit.socket.emit("/pilot/move", {
                    action: 'up',
                    speed: newspeed
                });
            } else
            if (data[0].y > vCenter + vgap) {
                console.log("descend");
                tracker.cockpit.socket.emit("/pilot/move", {
                    action: 'down',
                    speed: newspeed
                });
            } else {
                // tracker.cockpit.socket.emit("/pilot/drone", {
                //     action: 'stop'
                // });
                // console.log("don't move");
            }

        });


        this.on('locked', function() {
            console.log('target acquired');
        });

        this.on('lost', function() {
            console.log('target lost');
            tracker.cockpit.socket.emit("/pilot/drone", {
                action: 'stop'
            });
            tracker.crosshairs.style.display = 'none';
            tracker.disable();
        });
    };

    Tracker.prototype.prepareTrackingBuffer = function() {
        this.newPyramid.allocate(
            this.frameWidth,
            this.frameHeight,
            jsfeat.U8_t | jsfeat.C1_t
        );
        this.oldPyramid.allocate(
            this.frameWidth,
            this.frameHeight,
            jsfeat.U8_t | jsfeat.C1_t
        );
    };

    Tracker.prototype.update = function(frameBuffer) {
        var tmpXY,
            tmpPyramid,
            roundedX,
            roundedY;

        if (true !== this.enabled) {
            return;
        }
        tmpXY = this.newXY;
        this.newXY = this.oldXY;
        this.oldXY = tmpXY;

        tmpPyramid = this.newPyramid;
        this.newPyramid = this.oldPyramid;
        this.oldPyramid = tmpPyramid;

        this.trackFlow(frameBuffer);

        if (this.point_status[0] == 1) {
            roundedX = Math.round(
                this.newXY[0] * this.canvas.clientWidth / this.frameWidth
            );
            roundedY = Math.round(
                this.newXY[1] * this.canvas.clientHeight / this.frameHeight
            );
            if (
                (!this.locked) ||
                (roundedX !== this.oldRoundedX) ||
                (roundedY !== this.oldRoundedY)
            ) {
                this.oldRoundedX = roundedX;
                this.oldRoundedY = roundedY;
                this.emit('points', [{
                    x: roundedX,
                    y: roundedY
                }]);
            }
            if (!this.locked) {
                this.emit('locked');
            }
            this.locked = true;
        } else {
            if (this.locked) {
                this.emit('lost');
            }
            this.locked = false;
        }
        this.emit('done');
    };

    Tracker.prototype.setTrackingCoords = function(x, y) {
        this.locked = false;

        // translate from (stretched) canvas to framebuffer dimensions:
        this.newXY[0] = x * this.frameWidth / this.canvas.clientWidth;
        this.newXY[1] = y * this.frameHeight / this.canvas.clientHeight;
        // console.log('New tracking coords:', [x,y], this.newXY);
        this.enable();
    };

    Tracker.prototype.trackFlow = function(frameBuffer) {
        this.newPyramid.data[0].data.set(frameBuffer);

        jsfeat.imgproc.equalize_histogram(
            this.newPyramid.data[0].data,
            this.newPyramid.data[0].data
        );

        this.newPyramid.build(this.newPyramid.data[0], true);

        jsfeat.optical_flow_lk.track(
            this.oldPyramid, this.newPyramid,
            this.oldXY, this.newXY,
            1,
            50, // win_size
            30, // max_iterations
            this.point_status,
            0.01, // epsilon,
            0.001 // min_eigen
        );
    };

    Tracker.prototype.enable = function() {
        var tracker = this;
        if (this.enabled) {
            return;
        }
        this.enabled = true;

        if (!this.cockpit.videostream) {
            console.error('The Tracker plugin depends on plugin video-stream');
            return;
        }
        this.prepareTrackingBuffer();

        this.hookNextFrame();
        this.on('done', this.hookNextFrame.bind(this));
    };

    Tracker.prototype.disable = function() {
        this.enabled = false;
    };

    Tracker.prototype.on = function(event, callback) {
        var i = 0,
            handler;
        if (!this.observers[event]) {
            this.observers[event] = [];
        }
        this.observers[event].push(callback);
    };

    Tracker.prototype.emit = function(event, data) {
        var i = 0,
            handler;
        if (this.observers[event]) {
            for (i = 0; handler = this.observers[event][i]; ++i) {
                handler(data);
            }
        }
    };

    Tracker.prototype.hookNextFrame = function() {
        this.cockpit.videostream.onNextFrame(this.update.bind(this));

    };

    window.Cockpit.plugins.push(Tracker);

}(window, document));
