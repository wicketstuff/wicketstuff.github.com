---
layout: front
title: Home
---
Wicket Security
===============

*Wicket Security* is an attempt to create an out of the box reusable
authenticating and authorization framework for [Apache
Wicket](http://wicket.apache.org). It contains several projects which can be
used standalone or in conjunction with each other.

Latest release/build
--------------------

Release numbers of Wicket Security follow the major releases of Apache Wicket:
Wicket Security 1.3.x is compatible with Apache Wicket 1.3, Wicket Security
1.4.x is compatible with Apache Wicket 1.4.

 * Latest stable release is 1.3.0.
 * Latest development release is 1.4-rc1

The latest releases are available at SourceForge.

The latest builds are available at http://wicketstuff.org/maven/repository/org/apache/wicket/wicket-security/

Maven 2
-------

Wasp and Swarm can be downloaded from wicket-stuff maven repository by
including the following fragments in your project pom.

{% highlight xml %}
	<repository>
		<id>wicketstuff</id>
		<url>http://wicketstuff.org/maven/repository</url>
		<snapshots>
			<enabled>true</enabled>
		</snapshots>
		<releases>
			<enabled>true</enabled>
		</releases>
	</repository>

	<dependency>
		<groupId>org.apache.wicket.wicket-security</groupId>
		<artifactId>swarm</artifactId>
		<version>1.3.0</version>
		<scope>compile</scope>
	</dependency>
{% endhighlight %}

A separate dependency on Wasp is not necessary since maven will automatically
fetch it with Swarm. However if you are only interested in Wasp you can use
the following fragment.

{% highlight xml %}
	<dependency>
		<groupId>org.apache.wicket.wicket-security</groupId>
		<artifactId>wasp</artifactId>
		<version>1.3.0</version>
		<scope>compile</scope>
	</dependency>
{% endhighlight %}

Project maintainers
-------------------

Emond Papegaaij, Martijn Dashorst

SVN Repository
--------------

The SVN repository of the project (1.4-SNAPSHOT) is available at

 * https://wicket-stuff.svn.sourceforge.net/svnroot/wicket-stuff/trunk/wicket-security

The sourcecode for 1.3.0 is available at

 * https://wicket-stuff.svn.sourceforge.net/svnroot/wicket-stuff/branches/wicket-security-1.3.0-final/wasp/wicket-security-wasp 
 * https://wicket-stuff.svn.sourceforge.net/svnroot/wicket-stuff/branches/wicket-security-1.3.0-final/swarm/wicket-security-swarm
 * https://wicket-stuff.svn.sourceforge.net/svnroot/wicket-stuff/branches/wicket-security-1.3.0-final/examples/wicket-security-examples

Bug reports 
-----------

Bugs can be filed or monitored at the wicket stuff jira:

 * Wasp
 * Swarm
