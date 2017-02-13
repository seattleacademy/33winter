var arDrone = require('ar-drone');
var client  = arDrone.createClient({ip:"192.168.0.x"});
 
client.on("navdata",function(result){
	console.log(result);
})

client.animateLeds('blinkGreenRed',10,5)


// client.takeoff();

// client
// 	.after(1000, function(){
// 	this.calibrate(0);
// 	})
// 	// .after(5000, function(){
// 	// 	this.animate('flipLeft', 1000);
// 	// })
// 	.after(10000, function(){
// 		this.stop();
// 		this.land();
// 	});