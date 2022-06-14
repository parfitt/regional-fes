# Future Energy Scenario Data

National Grid ESO create yearly predictions for each Grid Supply Point over a variety of `parameters` for several `scenarios`. The data are stored in separate files - one for each `scenario`/`parameter` combination - within the [scenarios/gridsupplypoints](scenarios/gridsupplypoints/) sub-directory. 

## Files

The following files are in this directory:

TODO: The first two bullet points relate to the Graphs visualisation. I have not looked at these yet so they are still based on Northern Powergrid code.

* [colours.csv](colours.csv) - this is used to define the colours used for lines on the graphs.
* [graphs.pl](graphs.pl) - Perl code that generates the graphs and tables (runs in a Github action if `graphs/index.json` or any CSV files in `graphs/` are updated 
* [gridsupplypoints2nuts1.json](gridsupplypoints2nuts1.json) - how Grid Supply Points split between NUTS1 regions. Can include partial splits but must sum to 1.

## Sub-directories

### [graphs/](graphs/)

TODO: This section has not yet been looked at and is therefore still based on the Northern Powergrid code.

The graphs directory contains CSV files used to generate the graphs for `graph.html`. The [index.json](graphs/index.json) file defines each of the graphs that will be made by running `perl graph.pl`. Each one is of the form:

```
{
	"csv":"Total number of EVs (#).csv",
	"svg":"graph-ev.svg",
	"table":"graph-ev.html",
	"yaxis-label": "Number",
	"yaxis-max": 100,
	"yscale": 100,
	"left": 120
}
```

where `csv` is the CSV file in the [graphs/](graphs/) directory to use, `svg` is the file name for the resulting SVG graphic, `table` is the resulting HTML fragment for the table, `yaxis-label` is the y-axis label, `left` is the left placement (in pixels) of the y-axis, `yaxis-max` is the maximum value for the y-axis (useful for limiting the auto-range), and `yscale` is a factor by which to scale the y-axis values (particularly useful for getting to percentages from 0-1 range numbers).

### [lib/](lib/)

TODO: As this relates to the Graphs visualisation, I have not yet looked at it (it is based on Northern Powergrid code).

This directory contains Perl modules for use by the `graphs.pl` code.

### [maps/](maps/)

The maps directory contains GeoJSON files that are needed for the visualisation. These include:

  * [nuts1_BUC_4326.geojson](maps/nuts1_BUC_4326.geojson) - the NUTS1 region boundaries (2019)
  * [gridsupplypoints-unique-all.geojson](maps/gridsupplypoints-unique-all.geojson) - the geography of the Primary sub-stations (based on 2019)

### [scenarios/](scenarios/)

The [scenarios/index.json](scenarios/index.json) JSON file describes the scenarios and gives links to the relevant data files for each parameter within each scenario.

The `parameters` are defined in [scenarios/config.json](scenarios/config.json).

