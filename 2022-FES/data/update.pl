#!/usr/bin/perl
# This script will download and process FES data.
# It gets the building block definitions, the building block data, and the GSP info files.
# The 2022 building block definitions now have a "Included in ESO Data" column.
# Call this with:
#    perl update.pl
#    perl update.pl download

use warnings;
use utf8;
use Cwd qw(abs_path);
use Data::Dumper;
use Text::CSV;
use JSON::XS;
use POSIX qw(strftime);
use open qw( :std :encoding(UTF-8) );

# Get the real base directory for this script
my $basedir = "./";
if(abs_path($0) =~ /^(.*\/)[^\/]*/){ $basedir = $1; }


$cache = 1;
if(@ARGV && $ARGV[0] eq "download"){ $cache = 0; }

$workdir = $basedir."temp/";
if(!-d $workdir){
	`mkdir $workdir`;
}

logIt("Processing FES data");
logIt("===================");



# https://data.nationalgrideso.com/future-energy-scenarios/future-energy-scenario-fes-building-block-data
# https://data.nationalgrideso.com/future-energy-scenarios/regional-breakdown-of-fes-data-electricity/r/grid_supply_point_info
$csvs = {
	"bb-defs"=>{
		"url"=>"https://data.nationalgrideso.com/backend/dataset/30df2649-99cf-4f84-9128-6c58fc1ea72a/resource/e5ab7ecb-0ab1-4fe7-833c-1fe905b086f8/download/building-block-definitions-2022.csv",
		"file"=>$workdir."building-block-definitions.csv"
	},
	"bb"=>{
		"url"=>"https://data.nationalgrideso.com/backend/dataset/30df2649-99cf-4f84-9128-6c58fc1ea72a/resource/36fd3aa9-6e42-418f-b1bb-a31bbfcf2008/download/fes-2022-building-blocks-version-2.0.csv",
		"file"=>$workdir."building-block-data.csv"
	},
	"gsp"=>{
		"url"=>"https://data.nationalgrideso.com/backend/dataset/963525d6-5d83-4448-a99c-663f1c76330a/resource/41fb4ca1-7b59-4fce-b480-b46682f346c9/download/fes2021_regional_breakdown_gsp_info.csv",
		"file"=>$workdir."gsp-info.csv"
	}
};

# Get an update of the package file from the ESO data portal
$file = $workdir."datapackage.json";
$url = "https://data.nationalgrideso.com/future-energy-scenarios/future-energy-scenario-fes-building-block-data/datapackage.json";
logIt("Getting package from $url");
`curl -L -s $url > $file`;
$json = loadJSON($file);
# Go through resources from the most recent and find URLs of CSV files
$n = @{$json->{'resources'}};
for($i = $n-1; $i >= 0; $i--){
	if($json->{'resources'}[$i]{'format'} eq "csv"){
		if($json->{'resources'}[$i]{'name'} =~ /building_block_definitions/ && !$csvs->{'bb-defs'}{'url'}){
			$csvs->{'bb-defs'}{'url'} = $json->{'resources'}[$i]{'path'};
		}elsif($json->{'resources'}[$i]{'name'} =~ /building_blocks/ && !$csvs->{'bb'}{'url'}){
			$csvs->{'bb'}{'url'} = $json->{'resources'}[$i]{'path'};
		}
	}
}


# Download data
for $key (sort(keys(%{$csvs}))){
	$file = $csvs->{$key}{'file'};
	if(!$cache || !-e $csvs->{$key}{'file'} || -s $csvs->{$key}{'file'} == 0){
		logIt("Downloading CSV from $csvs->{$key}{'url'}");
		`wget -q --no-check-certificate -O $csvs->{$key}{'file'} "$csvs->{$key}{'url'}"`;
	}
}

###########
# GSPs
%gsps = getCSV($csvs->{'gsp'}{'file'},{
	'id'=>'GSP ID'
});
# Double check GSPs for duplicate names
%gspnames = ();
for $gsp (sort(keys(%gsps))){
	$prevgsp = $gspnames{$gsps{$gsp}{'Name'}};

	if($prevgsp){
		logIt("WARNING: Ambiguity for GSP name \"$gsps{$gsp}{'Name'}\" - assigned to $gsp and $prevgsp.");

		$gsps{$gsp}{'ambiguous'} = 1;
		$gsps{$gspnames{$gsps{$gsp}{'Name'}}}{'ambiguous'} = 1;

		# Update previously matched name
		# Remove previous name from dictionary
		delete $gspnames{$gsps{$prevgsp}{'Name'}};

		# Append a bracketed group to the name
		$gsps{$prevgsp}{'Name'} .= " (".$gsps{$prevgsp}{'GSP Group'}.")";
		# Add the GSP to the names dictionary with the new name
		$gspnames{$gsps{$prevgsp}{'Name'}} = $prevgsp;
		logIt("Updating name of $prevgsp to \"$gsps{$prevgsp}{'Name'}\"");

		# Update the current name
		$gsps{$gsp}{'Name'} .= " (".$gsps{$gsp}{'GSP Group'}.")";
		logIt("Updating name of $gsp to \"$gsps{$gsp}{'Name'}\"");
	}
	$gspnames{$gsps{$gsp}{'Name'}} = $gsp;
}

# Update the GeoJSON file with names
open(GEO,"maps/gridsupplypoints-unique-all-simplified.geojson");
@lines = <GEO>;
close(GEO);
%groupedgsp = ();
for($i = 0; $i < @lines; $i++){
	if($lines[$i] =~ /\"properties\":\{\"GSP\":\"([^\"]+)\"([^\}]*)\}/){
		$gsp = $1;
		@gspbits = split(/;/,$gsp);
		print "$gsp\n";
		$name = "";
		for($g = 0; $g < @gspbits; $g++){
			print "\t$g = $gspbits[$g] - $gsps{$gspbits[$g]}{'Name'}\n";
			$name .= ($name ? " / " : "").$gsps{$gspbits[$g]}{'Name'};
			$groupedgsp{$gspbits[$g]} = $gsp;
		}
		print $name."\n";
		$lines[$i] =~ s/\"properties\":\{\"GSP\":\"([^\"]+)\"([^\}]*)\}/\"properties\":\{\"GSP\":\"$1\",\"Name\":\"$name\"\}/;
		print $lines[$i];
	}
}
open(GEO,">","maps/gridsupplypoints-unique-all-simplified.geojson");
print GEO @lines;
close(GEO);

##################
# Building Blocks

# Load our parameter definition file
$parameters = loadJSON($basedir.'scenarios/parameters-building-blocks.json');

# STEP 1 - process the building block definitions
%bbdef = getCSV($csvs->{'bb-defs'}{'file'},{
	'id'=>'BBID',
	'headerline'=>1,
	'map'=>{
		'Building Block ID Number'=>'BBID'
	},
	'fillinblanks'=>{
		'Template'=>1,
		'Technology'=>1
	},
	'zapleadingspaces'=>{
		'Units'=>1
	},
	'zaptrailingspaces'=>{
		'Template'=>1,
		'Units'=>1
	}
});
for $id (sort(keys(%bbdef))){
	$name = "";
	# Construct a name to use for this building block
	if($bbdef{$id}{'Template'} eq "Generation"){
		$name = $bbdef{$id}{'Technology'}.": ".$bbdef{$id}{'Technology Detail'}." (".$bbdef{$id}{'Units'}.") ".$bbdef{$id}{'Detail'};
	}elsif($bbdef{$id}{'Template'} eq "Demand"){
		$name = $bbdef{$id}{'Technology Detail'}." (".$bbdef{$id}{'Units'}.") ".$bbdef{$id}{'Detail'};
	}elsif($bbdef{$id}{'Template'} eq "Demand Low Carbon Technologies"){
		$name = $bbdef{$id}{'Technology'}.": ".$bbdef{$id}{'Technology Detail'}." (".$bbdef{$id}{'Units'}.")";#." ".$bbdef{$id}{'Detail'};
	}elsif($bbdef{$id}{'Template'} eq "Storage & Flexibility"){
		$name = $bbdef{$id}{'Technology'}.": ".$bbdef{$id}{'Technology Detail'}." (".$bbdef{$id}{'Units'}.") ".$bbdef{$id}{'Detail'};
	}
	$desc = $bbdef{$id}{'Detail'};
	if($bbdef{$id}{'Comments'}){ $desc .= "\n".$bbdef{$id}{'Comments'}; }
	if($bbdef{$id}{'ESO Comments'}){ $desc .= "\n".$bbdef{$id}{'ESO Comments'}; }
	$desc =~ s/\n/<br \/>/g;
	$match = -1;
	for($i = 0; $i < @{$parameters}; $i++){
		if($parameters->[$i]{'key'} && $parameters->[$i]{'key'} eq $id){
			$match = $i;
		}
	}
	if($match >= 0){
		# Exists in config already so update
		$parameters->[$match]{"title"} = $name;
		$parameters->[$match]{"optgroup"} = $bbdef{$id}{'Template'};
	}else{
		# Create a new entry
		logIt("Add new $id");
		push(@{$parameters},{"key"=> $id, "title"=>$name, "optgroup"=> $bbdef{$id}{'Template'}, "combine"=>"sum", "dp"=>1, "description"=>$desc});
		$match = @{$parameters} - 1;
	}

	# Only include building blocks that are explicitly included in the ESO Data
	if($bbdef{$id}{'Included in ESO Data'} ne "Y"){
		logIt("WARNING: Excluding $id because the 'Included in ESO Data' column is \"$bbdef{$id}{'Included in ESO Data'}\".");
		splice(@{$parameters},$match,1);
	}


}

# Save the updated parameter configuration
$file = $basedir.'scenarios/parameters-building-blocks.json';
saveJSON($file,$parameters,{'postprocess'=>\&cleanParameters,'name'=>'parameters configuration'});
logIt("NOTE: You should check if this looks sensible. If this code has generated new parameters from the data you should make sure that the 'combine' method for each is set correctly to either \"max\" or \"sum\".");

if(!-d $workdir."building-blocks/"){
	$dir = $workdir."building-blocks/";
	`mkdir $dir`;
}
# STEP 2 - process building block data
opendir($dh,$workdir."building-blocks/");
while(($filename = readdir($dh))){
	if($filename =~ /.*building-block.*csv$/){
		$file = $workdir."building-blocks/".$filename;
		`rm $file`;
	}
}
closedir($dh);
logIt("Reading $file");
@rows = getCSV($csvs->{'bb'}{'file'},{
	'map'=>{
		'Building Block ID Number'=>'BBID'
	}
});

$ystart = 2021;
$yend = 2050;

my %data;
my %gspvalues;
my $gid;

for($i = 0; $i < @rows; $i++){
	$scenario = getShortCode($rows[$i]{'FES Scenario'});
	$bb = $rows[$i]{'BBID'};

	if(!$gspvalues{$scenario}){
		$gspvalues{$scenario} = {};
	}
	if(!$gspvalues{$scenario}{$bb}){
		$gspvalues{$scenario}{$bb} = {};
	}

	$id = $gspnames{$rows[$i]{'GSP'}};

	if(!$id){
		logIt("WARNING: In $scenario/$bb No ID for \"$rows[$i]{'GSP'}\"");
		$id = $rows[$i]{'GSP'};
		$gspnames{$rows[$i]{'GSP'}} = $rows[$i]{'GSP'};
	}

	$gid = $groupedgsp{$id};
	if($gid){
		
		if(!$gspvalues{$scenario}{$bb}{$gid}){ $gspvalues{$scenario}{$bb}{$gid} = {}; }

		for($yy = $ystart; $yy <= $yend; $yy++){
			if(!$gspvalues{$scenario}{$bb}{$gid}{$yy}){ $gspvalues{$scenario}{$bb}{$gid}{$yy} = 0; }


			if($rows[$i]{$yy}){
				$gspvalues{$scenario}{$bb}{$gid}{$yy} += $rows[$i]{$yy};
			}
		}
	}else{
		logIt("WARNING: No group ID for $id");
	}

}
foreach $scenario (keys(%gspvalues)){
	foreach $bb (keys(%{$gspvalues{$scenario}})){
		if(!$data{$scenario}){
			$data{$scenario} = {};
		}
		if(!$data{$scenario}{$bb}){
			$data{$scenario}{$bb} = {};
		}
		foreach $id (keys(%{$gspvalues{$scenario}{$bb}})){
			$data{$scenario}{$bb}{$id} = "";
			for($yy = $ystart; $yy <= $yend; $yy++){
				$data{$scenario}{$bb}{$id} .= ",".($gspvalues{$scenario}{$bb}{$id}{$yy}||"");
			}
		}
	}
}

# Load in the existing building blocks scenarios
$scenarios = loadJSON($basedir.'scenarios/index-building-blocks.json');
%scenariolookup;

for($s = 0; $s < @{$scenarios} ; $s++){
	$scode = getShortCode($scenarios->[$s]{'key'});
	$scenariolookup{$scenarios->[$s]{'key'}} = $scode;
	for($i = 0; $i < @{$parameters}; $i++){
		if($parameters->[$i]{'key'}){
			if(!$data{$scode}{$parameters->[$i]{'key'}}){
				logIt("WARNING: No building block data seems to exist for $scode $parameters->[$i]{'key'}");
			}
		}
	}
}

for $scenario (sort(keys(%data))){
	for $bb (sort(keys(%{$data{$scenario}}))){
		$file = $workdir."building-blocks/$scenario-building-block-$bb.csv";
		open($fh,">",$file);
		print $fh "GSP";
		for($yy = $ystart; $yy <= $yend; $yy++){
			print $fh ",$yy";
		}
		print $fh "\n";
		# We could either print the data we have or create placeholder data
		for $gsp (sort(keys(%{$data{$scenario}{$bb}}))){
			print $fh $gsp."$data{$scenario}{$bb}{$gsp}\n";
		}
		close($fh);
	}

	logIt("Scenario: $scenario");
	for($s = 0; $s < @{$scenarios} ; $s++){
		$scode = $scenarios->[$s]{'key'};
		if($scenariolookup{$scode} eq $scenario){
			logIt("\tUpdating $scode data");
			$scenarios->[$s]{'data'} = {};
			for $bb (sort(keys(%{$data{$scenario}}))){
				#"demandpk-all" : {"dataBy" : "gsp","file" : "gridsupplypoints/SP-DemandPk-All.csv","key" : "Primary"},
				$scenarios->[$s]{'data'}{$bb} = {"dataBy"=>"gsp","file"=>"gridsupplypoints/building-blocks/$scenario-building-block-$bb.csv","key"=>"GSP"};
			}
		}
	}
}

$file = $basedir.'scenarios/index-building-blocks.json';
saveJSON($file,$scenarios,{'postprocess'=>\&cleanScenarios,'name'=>'scenarios configuration'});











##########################
# SUBROUTINES

sub getShortCode {
	my $str = $_[0];
	$str =~ s/([A-Za-z])[a-z]+(\s|$)/$1/g;
	$str = uc(substr($str,0,2));
	return $str;
}

sub getCSV {
	my (@lines,@header,%datum,$c,$i,$id,@data,%dat,$startline,$line,@cols,$row,%prev);
	my ($file, $props) = @_;

	$line = 0;
	$startline = $props->{'headerline'}||0;
	$id = -1;

	my $csv = Text::CSV->new ({ binary => 1 });

	# Open the file
	open(my $fh,$file);
	while($row = $csv->getline($fh)){
		@cols = @$row;
		if($line == $startline){
			# Remove BOM
			$cols[0] =~ s/^\x{FEFF}//;
			for($i = 0; $i < @cols; $i++){
				# Only keep the header if it exists
				$header[$i] = $cols[$i];
			}
			# Map headers and find ID column
			for($c = 0; $c < @header; $c++){
				$header[$c] =~ s/(^\"|\"$)//g;
				if($props->{'map'} && $props->{'map'}{$header[$c]}){
					$header[$c] = $props->{'map'}{$header[$c]};
				}
				if($props->{'id'} && $header[$c] eq $props->{'id'}){
					$id = $c;
				}
			}
		}elsif($line > $startline){
			if(@header > 0){
				undef %datum;
				for($c = 0; $c < @cols; $c++){
					$cols[$c] =~ s/\’/\'/g;
					if($cols[$c] =~ /^" ?([0-9\,]+) ?"$/){
						$cols[$c] =~ s/(^" ?| ?"$)//g;
						$cols[$c] =~ s/\,//g;
					}
					$cols[$c] =~ s/(^\"|\"$)//g;
					if($props->{'zaptrailingspaces'}{$header[$c]}){
						$cols[$c] =~ s/\s$//g;
					}
					if($props->{'zapleadingspaces'}{$header[$c]}){
						$cols[$c] =~ s/^ //g;
					}

					if(!$cols[$c] && $props->{'fillinblanks'}{$header[$c]}){
						# Use a previously set value if we are filling in the blanks for this column
						$cols[$c] = $prev{$header[$c]};
					}
					if($header[$c] ne ""){
						$datum{$header[$c]} = $cols[$c];
					}
					if($cols[$c]){
						$prev{$header[$c]} = $cols[$c];
					}
				}
				if($id >= 0){
					$dat{$cols[$id]} = {%datum};
				}else{
					push(@data,{%datum});
				}
			}
		}
		$line++;
	}
	close(FILE);

	if($id >= 0){ return %dat; }
	else{ return @data; }
}


sub loadJSON {
	my ($file) = $_[0];
	my (@lines,$json,$str);

	open(FILE,$file);
	@lines = <FILE>;
	close(FILE);
	
	$str = join("",@lines);

	eval { $json = JSON::XS->new->decode($str); return $json; }
	or do { return {}; };
}


sub saveJSON {
	my $file = shift @_;
	my $jsondata = shift @_;
	my $conf = shift @_;
	my ($key,$str);

	$str = JSON::XS->new->utf8->allow_nonref(0)->relaxed(1)->pretty->canonical->encode($jsondata);
	
	# Use tabs instead of spaces for starts of lines
	$str =~ s/   /\t/g;

	# Fix boolean values
	$str =~ s/ : \"(true|false)\"/ : $1/g;


	if($conf->{'postprocess'}){
		$str = $conf->{'postprocess'}->($str);
	}

	# Save the event file
	logIt("Saving ".($conf->{'name'} || "JSON")." to $file");
	open(FILE,">",$file);
	print FILE $str;
	close(FILE);
	return;
}

sub cleanScenarios {
	my $str = $_[0];
	$str =~ s/" : /": /g;
	# Tidy up data variables which are 4 deep
	$str =~ s/\n\t{4}//g;
	$str =~ s/\n\t{3}\}/\}/g;
	$str =~ s/\n/===NEWLINE===/g;
	$str =~ s/("color":.*?)\,===NEWLINE===\t\t("key": "[^\"]+")/$2\,\n\t\t$1/g;
	$str =~ s/===NEWLINE===/\n/g;
	$str =~ s/\},\n\t\{/\},\{/g;
	return $str;
}
sub cleanParameters {
	my $str = $_[0];
	$str =~ s/" : /": /g;
	$str =~ s/\n\t\t//g;
	$str =~ s/\n\t\}/\}/g;
	$str =~ s/(\t\{)(.*)\,("key": ?"[^\"]+","optgroup": ?"[^\"]+","title": ?"[^\"]+")/$1$3,$2/g;
	return $str;
}

sub logIt {
	my ($fh,$str);
	$str = $_[0];
	open($fh,">>",$workdir."update.log");
	print $fh strftime("%FT%H:%M:%S", gmtime).":\t$str\n";
	print $str."\n";
	close($fh);
}