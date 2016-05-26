#!/bin/sh
pid=`ps -ef|grep "node"|grep "app.js" |grep -v grep |wc -l`
if [ $pid -eq 0 ] ; then 
	sudo killall -9 node
	nohup sudo node --expose-gc /home/ec2-user/twitter_nyc_private/app.js >/dev/null 2>&1 &
fi
