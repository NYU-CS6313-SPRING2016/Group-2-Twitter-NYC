#NYC Tweeter Monitor
![alt text](https://raw.githubusercontent.com/NYU-CS6313-SPRING2016/Group-2-Twitter-NYC/master/screenshot.png "Screenshot")

**Authors**: Liang Tang ([github-user-name](https://github.com/singku)), Yuwei Liu ([github-user-name](https://github.com/vivian3472 )) Weishi ([github-user-name](https://github.com/Weishi93)), Sheng Sun ([gitbug-user-name](https://github.com/se7enRune))

##Description
NYC Twitter Monitor (short by NTM) was developed to monit real-time tweets twited by Twitter users within NYC. By using the visualization of NTM, clients could see the 10 most popular Hashtags and Mentions, as well as the distribution of related tweets in GeoMap. Other features including hashtags' or mentions' trends in past 24hrs; filtered displaying of distributions; etc. Basically, we monit what topics were talked by people, talked in where and whether a topic is poular or not.

**Video**: http://link-to-video.com

**Demo**: http://link-to-demo.com

**Document**: http://link-to-finalreport.com ...

##Install instructions (if needed)
###Requirements 
The systems has the following dependences:
1. Install **Mongodb**
2. Install **NodeJs**


###Runing
1. Enter Project Dir
2. Run npm install
3. Run sudo node app.js (default port is 80)
4. Open Browser and enter http://localhost
5. The Homepage is hosted at http://www.asingku.com

###Note
The backend program will cache data of past 24hrs. Since js object occupy a lot of memory, 24hrs data may cause
memeory usage of this program increasing and killed by os sometime, becareful, you could either modify this cache strategy or use large memory



