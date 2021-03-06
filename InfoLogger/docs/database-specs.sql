CREATE TABLE `messages` (
  `severity` char(1) DEFAULT NULL,
  `level` tinyint(3) unsigned DEFAULT NULL,
  `timestamp` double(16,6) DEFAULT NULL,
  `hostname` varchar(32) DEFAULT NULL,
  `rolename` varchar(32) DEFAULT NULL,
  `pid` smallint(5) unsigned DEFAULT NULL,
  `username` varchar(32) DEFAULT NULL,
  `system` varchar(32) DEFAULT NULL,
  `facility` varchar(32) DEFAULT NULL,
  `detector` varchar(32) DEFAULT NULL,
  `partition` varchar(32) DEFAULT NULL,
  `dest` varchar(32) DEFAULT NULL,
  `run` int(10) unsigned DEFAULT NULL,
  `errcode` int(10) unsigned DEFAULT NULL,
  `errline` smallint(5) unsigned DEFAULT NULL,
  `errsource` varchar(32) DEFAULT NULL,
  `message` text,
  KEY `ix_severity` (`severity`),
  KEY `ix_level` (`level`),
  KEY `ix_timestamp` (`timestamp`),
  KEY `ix_hostname` (`hostname`(14)),
  KEY `ix_rolename` (`rolename`(20)),
  KEY `ix_system` (`system`(3)),
  KEY `ix_facility` (`facility`(20)),
  KEY `ix_detector` (`detector`(8)),
  KEY `ix_partition` (`partition`(10)),
  KEY `ix_dest` (`dest`(10)),
  KEY `ix_run` (`run`),
  KEY `ix_errcode` (`errcode`),
  KEY `ix_errline` (`errline`),
  KEY `ix_errsource` (`errsource`(20))
) ENGINE=InnoDB DEFAULT CHARSET=latin1
/*!50100 PARTITION BY HASH (timestamp div 86400)
PARTITIONS 365 */;
